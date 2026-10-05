import { acceptWhatsAppWebhook } from './services/whatsapp-webhook-ingress';
import express, { type Express } from "express";
import crypto from "crypto";
import { storage } from "./storage";
import whatsAppOfficialService from "./services/channels/whatsapp-official";
import TikTokService from "./services/channels/tiktok";
import instagramService from './services/channels/instagram';
import twilioSmsService from './services/channels/twilio-sms';
import webchatService from './services/channels/webchat';
import {
  createWhatsAppWebhookSecurity,
  createTikTokWebhookSecurity,
  verifyWhatsAppWebhookSignature,
  logWebhookSecurityEvent,
  createWebhookTriggerRateLimitMiddleware
} from "./middleware/webhook-security";
import { logTikTokWebhookEvent } from "./utils/webhook-logger";
import { ensureSuperAdmin, ensureAuthenticated, ensureCallAgentHealthAccess } from "./middleware";
import { testMetaWebhookSignature } from "./utils/webhook-signature-tester";
import { callAgentService, getCircuitBreakerState, resolveTwilioRecordingMediaUrl } from './services/call-agent-service';
import { callQualityMonitor } from './services/call-quality-monitor';
import { callLogsService } from "./services/call-logs-service";
import { CallLogsEventEmitter } from "./utils/websocket";
import { conferenceCleanupScheduler } from './services/conference-cleanup-scheduler';
import { calculateConferenceCost, trackCallCost } from './services/call-cost-tracker';
import { WebSocket } from "ws";
import { logger } from "./utils/logger";
import { isMetaWebhookSignatureBypassAllowed } from "./utils/meta-webhook-security";
import multer from "multer";
import { webhookTriggerProcessor } from "./services/webhook-trigger-processor";
import flowExecutor from "./services/flow-executor";
import { FlowExecutionContext } from "./services/flow-execution-context";
import { FlowExecutionManager } from "./services/flow-execution-manager";
import { buildWebhookResponse } from "./services/webhook-response-builder";
import { waitForExecution } from "./services/webhook-execution-waiter";
import type { WebhookPayload, ResponseConfig } from "@shared/types/webhook-trigger";
import { ResponseMode } from "@shared/types/webhook-trigger";
import {
  getVoiceProviderStackLabel,
  normalizeVoiceChannelConnectionData
} from "@shared/types/call-types";
import { buildCallRecordingFields } from "@shared/schema";
import {
  dispatchVoiceCall,
  getAiVoiceConfigurationError,
  getVoiceConnectionCredentialError,
  resolveEffectiveVoiceCallType
} from "./services/voice-provider-service";
import { getPublicBaseUrlFromRequest } from "./utils/twilio-public-url";
import { handleTelnyxVoiceWebhook } from "./telnyx-voice-webhook";
import { matchesActiveMetaPartnerWebhookVerifyToken } from "./services/meta-graph-api";

async function resolveTwilioAuthTokenFromVoiceConnections(
  from?: string,
  to?: string
): Promise<string | undefined> {
  if (!from && !to) return undefined;
  try {
    const voiceConnections = await storage.getChannelConnectionsByType('twilio_voice');
    for (const conn of voiceConnections) {
      const connData = conn.connectionData as Record<string, unknown> | null | undefined;
      if (!connData) continue;
      const authToken = connData.authToken;
      if (typeof authToken !== 'string' || !authToken) continue;
      const connFrom =
        (typeof connData.fromNumber === 'string' && connData.fromNumber) ||
        (typeof connData.phoneNumber === 'string' && connData.phoneNumber) ||
        undefined;
      if (connFrom && (connFrom === from || connFrom === to)) {
        return authToken;
      }
    }
  } catch (e) {
    console.warn('[CallAgent] resolveTwilioAuthTokenFromVoiceConnections failed:', e);
  }
  return undefined;
}

async function resolveTwilioAuthTokenFromAccountSid(accountSid: string): Promise<string | undefined> {
  if (!accountSid) return undefined;
  try {
    const voiceConnections = await storage.getChannelConnectionsByType('twilio_voice');
    for (const conn of voiceConnections) {
      const connData = conn.connectionData as Record<string, unknown> | null | undefined;
      if (!connData) continue;
      if (connData.accountSid === accountSid && typeof connData.authToken === 'string' && connData.authToken) {
        return connData.authToken;
      }
    }
  } catch (e) {
    console.warn('[CallAgent] resolveTwilioAuthTokenFromAccountSid failed:', e);
  }
  return undefined;
}

/** Participant join timeout handles keyed by callLog.id (string), persisted across webhook calls to avoid false agent_join_timeout alerts. */
const agentJoinTimeoutHandles = new Map<string, NodeJS.Timeout>();

/**
 * Register webhook endpoints before any JSON middleware to avoid body parsing conflicts
 * This ensures webhooks receive raw bodies for proper signature verification
 */
/** Custom path pattern (URL-safe): alphanumeric, hyphens, underscores, slashes only */
const CUSTOM_PATH_REGEX = /^[a-zA-Z0-9\-_\/]+$/;
/** Token format: alphanumeric, 32+ characters */
const TOKEN_REGEX = /^[a-zA-Z0-9]{32,}$/;
const MAX_JSON_DEPTH = 20;
const SENSITIVE_HEADERS = new Set(['authorization', 'cookie', 'x-api-key']);
const WEBHOOK_TRIGGER_BODY_LIMIT = '10mb';
const WEBHOOK_TRIGGER_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/** Multer config for multipart/form-data (10MB limit, consistent with body limit) */
const webhookTriggerMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: WEBHOOK_TRIGGER_MAX_FILE_SIZE }
});

/** In-memory metrics for webhook trigger endpoints */
const webhookTriggerMetrics = {
  totalRequests: 0,
  byTriggerId: new Map<number, number>(),
  byIp: new Map<string, number>(),
  responseTimes: [] as number[],
  maxResponseTimes: 100
};

function setWebhookTriggerSecurityHeaders(res: express.Response, requestId: string): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Request-ID', requestId);
}

function setWebhookTriggerCorsHeaders(res: express.Response): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, User-Agent, X-Webhook-Signature');
}

function filterHeadersForLog(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (SENSITIVE_HEADERS.has(lower)) continue;
    if (value === undefined) continue;
    out[key] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return out;
}

function limitPayloadDepth(obj: unknown, maxDepth: number, currentDepth = 0): unknown {
  if (currentDepth >= maxDepth) return null;
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((item) => limitPayloadDepth(item, maxDepth, currentDepth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = limitPayloadDepth(v, maxDepth, currentDepth + 1);
  }
  return out;
}

function sendWebhookTriggerError(
  res: express.Response,
  status: number,
  error: string,
  requestId: string
): void {
  setWebhookTriggerSecurityHeaders(res, requestId);
  setWebhookTriggerCorsHeaders(res);
  res.status(status).json({
    error,
    requestId,
    timestamp: new Date().toISOString()
  });
}

function getResponseConfig(trigger: { responseConfig?: unknown }): ResponseConfig {
  const rc = trigger.responseConfig as ResponseConfig | undefined;
  return {
    statusCode: rc?.statusCode ?? 200,
    bodyTemplate: rc?.bodyTemplate ?? '{"success": true, "requestId": "{{webhook.requestId}}", "message": "Webhook received"}',
    headers: rc?.headers ?? { 'Content-Type': 'application/json' },
    mode: rc?.mode === ResponseMode.SYNC ? ResponseMode.SYNC : ResponseMode.ASYNC,
    timeout: rc?.timeout ?? 30000
  };
}

function sendWebhookResponse(
  res: express.Response,
  requestId: string,
  webhookResponse: { statusCode: number; body: string; headers: Record<string, string>; contentType: string }
): void {
  setWebhookTriggerSecurityHeaders(res, requestId);
  setWebhookTriggerCorsHeaders(res);
  res.status(webhookResponse.statusCode);
  const headers = { ...webhookResponse.headers };
  const hasContentType = Object.keys(headers).some((k) => k.toLowerCase() === 'content-type');
  if (!hasContentType) {
    headers['Content-Type'] = webhookResponse.contentType;
  }
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
  res.send(webhookResponse.body);
}

const webhookTriggerBodyParser = [
  express.json({ limit: WEBHOOK_TRIGGER_BODY_LIMIT }),
  express.urlencoded({ extended: true, limit: WEBHOOK_TRIGGER_BODY_LIMIT }),
  webhookTriggerMulter.any()
];

/**
 * Verify ElevenLabs webhook signature (HMAC-SHA256).
 * Matches Stripe-style scheme used by ElevenLabs: header "t=timestamp,v1=hex_signature", signed payload = "timestamp.rawBody".
 * @see https://elevenlabs.io/docs/eleven-agents/workflows/post-call-webhooks
 */
function verifyElevenlabsWebhookSignature(rawBody: string | Buffer, signatureHeader: string | undefined, secret: string): boolean {
  if (!secret || !signatureHeader) return false;
  const payloadForSigning = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  const rawHeader = signatureHeader.trim();
  const parts = rawHeader.split(',').reduce((acc, part) => {
    const [k, v] = part.split('=');
    if (k && v) acc[k.trim().toLowerCase()] = v.trim();
    return acc;
  }, {} as Record<string, string>);
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  const signedPayload = `${t}.${payloadForSigning}`;
  const secretsToTry: string[] = [secret];
  if (secret.startsWith('wsec_') && secret.length > 5) {
    secretsToTry.push(secret.slice(5));
  }
  const expectedHex = (key: string) => crypto.createHmac('sha256', key).update(signedPayload).digest('hex');
  const receivedBuf = Buffer.from(v1, 'hex');
  if (receivedBuf.length !== v1.length / 2) return false;
  for (const key of secretsToTry) {
    const expected = expectedHex(key);
    const expectedBuf = Buffer.from(expected, 'hex');
    if (expectedBuf.length === receivedBuf.length && crypto.timingSafeEqual(receivedBuf, expectedBuf)) return true;
  }
  return false;
}

export function registerWebhookRoutes(app: Express): void {
  // ElevenLabs post-call webhook (raw body via express.text in index.ts)
  // Webhook secret is taken only from the Twilio Voice connection (elevenLabsWebhookSecret); no env fallback (SaaS per-company config).
  app.post('/api/webhooks/elevenlabs/post-call', async (req: express.Request, res: express.Response) => {
    try {
      const rawBody: string | Buffer = Buffer.isBuffer(req.body)
        ? req.body
        : typeof req.body === 'string'
          ? req.body
          : (req.body && typeof req.body === 'object' ? JSON.stringify(req.body) : '');
      const rawBodyStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
      const signature = req.headers['elevenlabs-signature'] as string | undefined;
      const payload = JSON.parse(rawBodyStr || '{}') as { type?: string; data?: Record<string, unknown>; event_timestamp?: number };
      const data = payload.data;
      const conversationId = data ? ((data.conversation_id as string) ?? (data as any).conversation_id) : null;
      if (!conversationId) {
        return res.status(400).json({ error: 'Missing conversation_id' });
      }
      const callLog = await callLogsService.findCallLogByElevenlabsConversationId(String(conversationId));
      if (!callLog?.channelId) {
        logger.warn('ElevenLabs Webhook', 'Call not found or no channel');
        return res.status(401).json({ error: 'Invalid signature' });
      }
      const connection = await storage.getChannelConnection(callLog.channelId);
      const cd = connection?.connectionData as Record<string, string> | undefined;
      const secret = cd?.elevenLabsWebhookSecret?.trim() ?? '';
      if (!secret) {
        logger.warn('ElevenLabs Webhook', 'Webhook secret not configured for this connection');
        return res.status(401).json({ error: 'Invalid signature' });
      }
      // Verify HMAC by default. Set ELEVENLABS_WEBHOOK_SKIP_VERIFY=1 only if the request passes through a proxy/tunnel that alters the body (e.g. some dev tunnels).
      const skipVerify = process.env.ELEVENLABS_WEBHOOK_SKIP_VERIFY === '1';
      const signatureValid = skipVerify || verifyElevenlabsWebhookSignature(rawBody, signature, secret);
      if (!signatureValid) {
        logger.warn('ElevenLabs Webhook', 'Invalid or missing signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
      const eventType = payload.type;
      if (!eventType || !data) {
        return res.status(400).json({ error: 'Invalid webhook payload' });
      }
      const allowed = ['post_call_transcription', 'post_call_audio', 'call_initiation_failure'];
      if (!allowed.includes(eventType)) {
        return res.status(200).json({ received: true });
      }
      await callLogsService.saveElevenlabsWebhookEvent({
        elevenlabsConversationId: String(conversationId),
        eventType: eventType as 'post_call_transcription' | 'post_call_audio' | 'call_initiation_failure',
        payload: data
      });
      return res.status(200).json({ received: true });
    } catch (err: any) {
      logger.error('ElevenLabs Webhook', 'Post-call webhook error', err);
      return res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  // CORS preflight for webhook trigger endpoints
  app.options('/api/webhook/trigger', (_req, res) => {
    setWebhookTriggerCorsHeaders(res);
    res.status(204).end();
  });
  app.options('/api/webhook/trigger/*', (_req, res) => {
    setWebhookTriggerCorsHeaders(res);
    res.status(204).end();
  });

  // --- Webhook trigger logs API (auth required; flow ownership enforced) ---
  app.get('/api/webhook-triggers/logs/count', ensureAuthenticated, async (req: express.Request, res: express.Response) => {
    try {
      const flowIdParam = req.query.flowId as string | undefined;
      const flowId = flowIdParam ? parseInt(flowIdParam, 10) : undefined;
      if (flowId === undefined || isNaN(flowId) || flowId < 1) {
        return res.status(400).json({ message: 'Valid flowId is required' });
      }
      const flow = await storage.getFlow(flowId);
      if (!flow) {
        return res.status(404).json({ message: 'Flow not found' });
      }
      const user = (req as any).user;
      if (user && flow.userId !== user.id && flow.companyId !== user.companyId) {
        return res.status(403).json({ message: 'You do not have permission to view this flow' });
      }
      const count = await storage.getWebhookTriggerLogsCountByFlowId(flowId, true);
      return res.json({ count });
    } catch (err: any) {
      logger.error('WebhookTriggers', 'Error fetching webhook logs count', err);
      return res.status(500).json({ message: err.message || 'Internal server error' });
    }
  });

  app.get('/api/webhook-triggers/logs', ensureAuthenticated, async (req: express.Request, res: express.Response) => {
    try {
      const flowIdParam = req.query.flowId as string | undefined;
      const flowId = flowIdParam ? parseInt(flowIdParam, 10) : undefined;
      const triggerIdParam = req.query.triggerId as string | undefined;
      const triggerId = triggerIdParam ? parseInt(triggerIdParam, 10) : undefined;
      const status = (req.query.status as string) || undefined;
      const search = (req.query.search as string) || undefined;
      const limit = Math.min(parseInt((req.query.limit as string) || '20', 10), 100);
      const offset = Math.max(0, parseInt((req.query.offset as string) || '0', 10));
      const user = (req as any).user;

      if (flowId !== undefined) {
        if (isNaN(flowId) || flowId < 1) {
          return res.status(400).json({ message: 'Invalid flowId' });
        }
        const flow = await storage.getFlow(flowId);
        if (!flow) {
          return res.status(404).json({ message: 'Flow not found' });
        }
        if (user && flow.userId !== user.id && flow.companyId !== user.companyId) {
          return res.status(403).json({ message: 'You do not have permission to view these logs' });
        }
        const { logs, total } = await storage.getWebhookTriggerLogsByFlowId(flowId, { status, limit, offset, search });
        const logsWithPreview = logs.map((log) => {
          const payloadStr = typeof log.payload === 'string' ? log.payload : JSON.stringify(log.payload ?? {});
          const payloadPreview = payloadStr.length > 200 ? payloadStr.slice(0, 200) + '…' : payloadStr;
          return { ...log, payloadPreview };
        });
        return res.json({ logs: logsWithPreview, meta: { flowId, total, limit, offset } });
      }

      if (triggerId !== undefined) {
        if (isNaN(triggerId) || triggerId < 1) {
          return res.status(400).json({ message: 'Invalid trigger ID' });
        }
        const trigger = await storage.getWebhookTrigger(triggerId);
        if (!trigger) {
          return res.status(404).json({ message: 'Webhook trigger not found' });
        }
        const flow = await storage.getFlow(trigger.flowId);
        if (!flow) {
          return res.status(404).json({ message: 'Flow not found' });
        }
        if (user && flow.userId !== user.id && flow.companyId !== user.companyId) {
          return res.status(403).json({ message: 'You do not have permission to view these logs' });
        }
        const logs = await storage.getWebhookTriggerLogs(triggerId, limit, undefined);
        const logsWithPreview = logs.map((log) => {
          const payloadStr = typeof log.payload === 'string' ? log.payload : JSON.stringify(log.payload ?? {});
          const payloadPreview = payloadStr.length > 200 ? payloadStr.slice(0, 200) + '…' : payloadStr;
          return { ...log, payloadPreview };
        });
        return res.json({ logs: logsWithPreview, meta: { triggerId, count: logs.length, limit } });
      }

      if (!user?.companyId) {
        return res.status(400).json({ message: 'flowId or triggerId is required' });
      }
      const logs = await storage.getWebhookTriggerLogs(undefined, limit, user.companyId);
      const logsWithPreview = logs.map((log) => {
        const payloadStr = typeof log.payload === 'string' ? log.payload : JSON.stringify(log.payload ?? {});
        const payloadPreview = payloadStr.length > 200 ? payloadStr.slice(0, 200) + '…' : payloadStr;
        return { ...log, payloadPreview };
      });
      return res.json({ logs: logsWithPreview, meta: { count: logs.length, limit } });
    } catch (err: any) {
      logger.error('WebhookTriggers', 'Error fetching webhook trigger logs', err);
      return res.status(500).json({ message: err.message || 'Internal server error' });
    }
  });

  app.delete('/api/webhook-triggers/logs', ensureAuthenticated, async (req: express.Request, res: express.Response) => {
    try {
      const flowIdParam = req.query.flowId as string | undefined;
      const flowId = flowIdParam ? parseInt(flowIdParam, 10) : undefined;
      if (flowId === undefined || isNaN(flowId) || flowId < 1) {
        return res.status(400).json({ message: 'flowId is required and must be a positive number' });
      }
      const flow = await storage.getFlow(flowId);
      if (!flow) {
        return res.status(404).json({ message: 'Flow not found' });
      }
      const user = (req as any).user;
      if (user && flow.userId !== user.id && flow.companyId !== user.companyId) {
        return res.status(403).json({ message: 'You do not have permission to clear logs for this flow' });
      }
      const deleted = await storage.deleteWebhookTriggerLogsByFlowId(flowId);
      return res.json({ deleted });
    } catch (err: any) {
      logger.error('WebhookTriggers', 'Error clearing webhook trigger logs', err);
      return res.status(500).json({ message: err.message || 'Internal server error' });
    }
  });

  app.get('/api/webhook-triggers/logs/:requestId/details', ensureAuthenticated, async (req: express.Request, res: express.Response) => {
    try {
      const requestId = req.params.requestId as string;
      if (!requestId) {
        return res.status(400).json({ message: 'requestId is required' });
      }
      const log = await storage.getWebhookTriggerLogByRequestId(requestId);
      if (!log) {
        return res.status(404).json({ message: 'Log not found' });
      }
      const flowId = log.flowId;
      if (!flowId) {
        return res.status(404).json({ message: 'Flow not found for this log' });
      }
      const flow = await storage.getFlow(flowId);
      if (!flow) {
        return res.status(404).json({ message: 'Flow not found' });
      }
      const user = (req as any).user;
      if (user && flow.userId !== user.id && flow.companyId !== user.companyId) {
        return res.status(403).json({ message: 'You do not have permission to view this log' });
      }
      let executionPath: unknown = null;
      if (log.executionId) {
        const exec = await storage.getFlowExecutionByExecutionId(log.executionId);
        if (exec) {
          executionPath = { status: exec.status, executionPath: exec.executionPath, errorMessage: exec.errorMessage };
        }
      }
      const contactName = log.contactId ? (await storage.getContact(log.contactId))?.name : undefined;
      const inspector = {
        requestId: log.requestId,
        timestamp: log.createdAt,
        status: log.status,
        errorMessage: log.errorMessage ?? undefined,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        responseTime: log.processingTimeMs,
        payload: log.payload,
        headers: log.headers,
        queryParams: log.queryParams,
        filterEvaluation: log.filterResult,
        contactResolution: {
          strategy: log.contactId != null ? 'extract_or_create' : 'system',
          contactId: log.contactId,
          contactName: contactName ?? undefined,
          conversationId: log.conversationId
        },
        executionPath
      };
      return res.json(inspector);
    } catch (err: any) {
      logger.error('WebhookTriggers', 'Error fetching webhook log details', err);
      return res.status(500).json({ message: err.message || 'Internal server error' });
    }
  });

  app.post('/api/webhook-triggers/logs/:requestId/replay', ensureAuthenticated, async (req: express.Request, res: express.Response) => {
    try {
      const requestId = req.params.requestId as string;
      if (!requestId) {
        return res.status(400).json({ message: 'requestId is required' });
      }
      const log = await storage.getWebhookTriggerLogByRequestId(requestId);
      if (!log) {
        return res.status(404).json({ message: 'Log not found' });
      }
      if (!log.triggerId) {
        return res.status(400).json({ message: 'Cannot replay: log has no trigger' });
      }
      const trigger = await storage.getWebhookTrigger(log.triggerId);
      if (!trigger) {
        return res.status(404).json({ message: 'Webhook trigger not found' });
      }
      const flow = await storage.getFlow(trigger.flowId);
      if (!flow) {
        return res.status(404).json({ message: 'Flow not found' });
      }
      const user = (req as any).user;
      if (user && flow.userId !== user.id && flow.companyId !== user.companyId) {
        return res.status(403).json({ message: 'You do not have permission to replay this webhook' });
      }
      if (!trigger.isActive) {
        return res.status(400).json({ message: 'Webhook trigger is disabled' });
      }
      const replayRequestId = `${log.requestId}-replay-${Date.now()}`;
      const webhookPayload = {
        body: log.payload,
        headers: (log.headers as Record<string, string>) || {},
        queryParams: (log.queryParams as Record<string, string>) || {},
        method: 'POST',
        path: '/replay',
        ipAddress: log.ipAddress ?? undefined,
        userAgent: log.userAgent ?? undefined
      };
      try {
        await storage.createWebhookTriggerLog({
          requestId: replayRequestId,
          triggerId: trigger.id,
          flowId: trigger.flowId,
          executionId: null,
          payload: (log.payload ?? {}) as Record<string, unknown>,
          headers: (log.headers as object) || {},
          queryParams: (log.queryParams as object) || {},
          status: 'received',
          filterResult: null,
          contactId: null,
          conversationId: null,
          responseStatus: null,
          responseBody: null,
          errorMessage: null,
          ipAddress: log.ipAddress ?? undefined,
          userAgent: log.userAgent ?? undefined,
          processingTimeMs: null
        });
      } catch (logErr) {
        logger.error('WebhookTriggers', 'Replay log create failed', { replayRequestId, err: logErr });
      }
      const webhookContext = await webhookTriggerProcessor.processWebhook(replayRequestId, trigger, webhookPayload);
      if (!webhookContext) {
        return res.json({ success: false, message: 'Replay filtered or failed processing', executionId: null });
      }
      const startResult = await flowExecutor.executeWebhookTriggeredFlow(webhookContext, trigger, flow);
      return res.json({
        success: true,
        executionId: startResult?.executionId ?? null,
        requestId: replayRequestId
      });
    } catch (err: any) {
      logger.error('WebhookTriggers', 'Error replaying webhook', err);
      return res.status(500).json({ message: err.message || 'Internal server error' });
    }
  });

  /**
   * Webhook Trigger Receiver - Auto-generated URL
   *
   * Receives webhook events from external systems and triggers flow execution.
   *
   * @route POST /api/webhook/trigger/:flowId/:token
   * @param {number} flowId - The ID of the flow to trigger
   * @param {string} token - The webhook security token (32+ characters)
   * @body {any} payload - The webhook payload (JSON or form-data)
   * @returns {200} Webhook received and queued for processing
   * @returns {400} Invalid request parameters or malformed payload
   * @returns {401} Invalid webhook token
   * @returns {403} Webhook trigger is disabled
   * @returns {404} Webhook trigger not found
   * @returns {429} Rate limit exceeded
   * @returns {500} Internal server error
   *
   * @example
   * POST /api/webhook/trigger/123/abc123def456...
   * Content-Type: application/json
   *
   * {
   *   "event": "order.created",
   *   "order_id": "12345",
   *   "customer": {
   *     "email": "customer@example.com",
   *     "phone": "+1234567890"
   *   }
   * }
   */
  app.post(
    '/api/webhook/trigger/:flowId/:token',
    ...webhookTriggerBodyParser,
    createWebhookTriggerRateLimitMiddleware(),
    async (req: express.Request, res: express.Response) => {
      const requestId = crypto.randomUUID();
      const startTime = Date.now();
      const ip = req.ip || (req.socket?.remoteAddress as string) || 'unknown';
      setWebhookTriggerSecurityHeaders(res, requestId);
      setWebhookTriggerCorsHeaders(res);

      try {
        const flowIdParam = req.params.flowId;
        const token = req.params.token;
        const flowId = parseInt(flowIdParam, 10);
        if (!Number.isInteger(flowId) || flowId <= 0) {
          try {
            await storage.createWebhookTriggerLog({
              requestId,
              triggerId: null,
              flowId: null,
              executionId: null,
              payload: {},
              headers: filterHeadersForLog(req.headers as Record<string, string | string[] | undefined>),
              queryParams: (req.query as Record<string, string>) || {},
              status: 'failed',
              filterResult: null,
              contactId: null,
              conversationId: null,
              responseStatus: 400,
              responseBody: null,
              errorMessage: 'Invalid flow ID',
              ipAddress: ip,
              userAgent: (req.headers['user-agent'] as string) || '',
              processingTimeMs: Date.now() - startTime
            });
          } catch (_) { /* ignore */ }
          return sendWebhookTriggerError(res, 400, 'Invalid flow ID', requestId);
        }
        if (!token || !TOKEN_REGEX.test(token)) {
          try {
            await storage.createWebhookTriggerLog({
              requestId,
              triggerId: null,
              flowId: null,
              executionId: null,
              payload: {},
              headers: filterHeadersForLog(req.headers as Record<string, string | string[] | undefined>),
              queryParams: (req.query as Record<string, string>) || {},
              status: 'failed',
              filterResult: null,
              contactId: null,
              conversationId: null,
              responseStatus: 400,
              responseBody: null,
              errorMessage: 'Invalid token format',
              ipAddress: ip,
              userAgent: (req.headers['user-agent'] as string) || '',
              processingTimeMs: Date.now() - startTime
            });
          } catch (_) { /* ignore */ }
          return sendWebhookTriggerError(res, 400, 'Invalid token format', requestId);
        }

        const trigger = await storage.getWebhookTriggerByToken(token);
        if (!trigger) {
          try {
            await storage.createWebhookTriggerLog({
              requestId,
              triggerId: null,
              flowId: null,
              executionId: null,
              payload: {},
              headers: filterHeadersForLog(req.headers as Record<string, string | string[] | undefined>),
              queryParams: (req.query as Record<string, string>) || {},
              status: 'failed',
              filterResult: null,
              contactId: null,
              conversationId: null,
              responseStatus: 404,
              responseBody: null,
              errorMessage: 'Webhook trigger not found',
              ipAddress: ip,
              userAgent: (req.headers['user-agent'] as string) || '',
              processingTimeMs: Date.now() - startTime
            });
          } catch (_) { /* ignore */ }
          return sendWebhookTriggerError(res, 404, 'Webhook trigger not found', requestId);
        }
        if (trigger.flowId !== flowId) {
          try {
            await storage.createWebhookTriggerLog({
              requestId,
              triggerId: trigger.id,
              flowId: trigger.flowId,
              executionId: null,
              payload: {},
              headers: filterHeadersForLog(req.headers as Record<string, string | string[] | undefined>),
              queryParams: (req.query as Record<string, string>) || {},
              status: 'failed',
              filterResult: null,
              contactId: null,
              conversationId: null,
              responseStatus: 404,
              responseBody: null,
              errorMessage: 'Webhook trigger not found',
              ipAddress: ip,
              userAgent: (req.headers['user-agent'] as string) || '',
              processingTimeMs: Date.now() - startTime
            });
          } catch (_) { /* ignore */ }
          return sendWebhookTriggerError(res, 404, 'Webhook trigger not found', requestId);
        }

        const tokenBuf = Buffer.from(token, 'utf8');
        const storedBuf = Buffer.from(trigger.webhookToken, 'utf8');
        if (tokenBuf.length !== storedBuf.length || !crypto.timingSafeEqual(storedBuf, tokenBuf)) {
          try {
            await storage.createWebhookTriggerLog({
              requestId,
              triggerId: trigger.id,
              flowId: trigger.flowId,
              executionId: null,
              payload: {},
              headers: filterHeadersForLog(req.headers as Record<string, string | string[] | undefined>),
              queryParams: (req.query as Record<string, string>) || {},
              status: 'failed',
              filterResult: null,
              contactId: null,
              conversationId: null,
              responseStatus: 401,
              responseBody: null,
              errorMessage: 'Invalid webhook token',
              ipAddress: ip,
              userAgent: (req.headers['user-agent'] as string) || '',
              processingTimeMs: Date.now() - startTime
            });
          } catch (_) { /* ignore */ }
          return sendWebhookTriggerError(res, 401, 'Invalid webhook token', requestId);
        }

        if (!trigger.isActive) {
          try {
            await storage.createWebhookTriggerLog({
              requestId,
              triggerId: trigger.id,
              flowId: trigger.flowId,
              executionId: null,
              payload: {},
              headers: filterHeadersForLog(req.headers as Record<string, string | string[] | undefined>),
              queryParams: (req.query as Record<string, string>) || {},
              status: 'failed',
              filterResult: null,
              contactId: null,
              conversationId: null,
              responseStatus: 403,
              responseBody: null,
              errorMessage: 'Webhook trigger is disabled',
              ipAddress: ip,
              userAgent: (req.headers['user-agent'] as string) || '',
              processingTimeMs: Date.now() - startTime
            });
          } catch (_) { /* ignore */ }
          return sendWebhookTriggerError(res, 403, 'Webhook trigger is disabled', requestId);
        }

        const company = await storage.getCompany(trigger.companyId);
        if (!company || !company.active) {
          try {
            await storage.createWebhookTriggerLog({
              requestId,
              triggerId: trigger.id,
              flowId: trigger.flowId,
              executionId: null,
              payload: {},
              headers: filterHeadersForLog(req.headers as Record<string, string | string[] | undefined>),
              queryParams: (req.query as Record<string, string>) || {},
              status: 'failed',
              filterResult: null,
              contactId: null,
              conversationId: null,
              responseStatus: 403,
              responseBody: null,
              errorMessage: 'Company is inactive or suspended',
              ipAddress: ip,
              userAgent: (req.headers['user-agent'] as string) || '',
              processingTimeMs: Date.now() - startTime
            });
          } catch (_) { /* ignore */ }
          return sendWebhookTriggerError(res, 403, 'Company is inactive or suspended', requestId);
        }

        const bodyFields = req.body ?? {};
        const files = (req as express.Request & { files?: Express.Multer.File[] }).files;
        const payload = Array.isArray(files) && files.length > 0
          ? { ...bodyFields, _files: files.map((f: Express.Multer.File) => ({ fieldname: f.fieldname, originalname: f.originalname, mimetype: f.mimetype, size: f.size })) }
          : bodyFields;
        const safePayload = limitPayloadDepth(payload, MAX_JSON_DEPTH) as Record<string, unknown>;
        const headers = filterHeadersForLog(req.headers as Record<string, string | string[] | undefined>);
        const queryParams = (req.query as Record<string, string>) || {};
        const userAgent = (req.headers['user-agent'] as string) || '';

        try {
          await storage.createWebhookTriggerLog({
            requestId,
            triggerId: trigger.id,
            flowId: trigger.flowId,
            executionId: null,
            payload: safePayload,
            headers,
            queryParams,
            status: 'received',
            filterResult: null,
            contactId: null,
            conversationId: null,
            responseStatus: null,
            responseBody: null,
            errorMessage: null,
            ipAddress: ip,
            userAgent,
            processingTimeMs: null
          });
        } catch (logErr) {
          console.error('Webhook trigger log create failed:', requestId, logErr);
          return sendWebhookTriggerError(res, 500, 'Internal server error', requestId);
        }

        const webhookPayload: WebhookPayload = {
          body: safePayload,
          headers,
          queryParams,
          method: req.method,
          path: req.path,
          ipAddress: ip,
          userAgent
        };
        const webhookContext = await webhookTriggerProcessor.processWebhook(requestId, trigger, webhookPayload);
        if (!webhookContext) {
          const response = {
            success: true,
            requestId,
            message: 'Webhook received but filtered or failed processing'
          };
          const duration = Date.now() - startTime;
          res.status(200).json(response);
          storage.updateWebhookTriggerLogByRequestId(requestId, {
            responseStatus: 200,
            responseBody: JSON.stringify(response),
            processingTimeMs: duration
          }).catch((err) => console.error('Webhook trigger log update failed:', requestId, err));
          return;
        }

        const flow = await storage.getFlow(trigger.flowId);
        if (!flow) {
          await storage.updateWebhookTriggerLogByRequestId(requestId, { status: 'failed', errorMessage: 'Flow not found' });
          return sendWebhookTriggerError(res, 404, 'Flow not found', requestId);
        }
        if (flow.status === 'draft') {
          await storage.updateWebhookTriggerLogByRequestId(requestId, { status: 'failed', errorMessage: 'Flow is in draft mode' });
          return sendWebhookTriggerError(res, 403, 'Flow is in draft mode', requestId);
        }

        let startResult: { executionId: string } | null = null;
        try {
          startResult = await flowExecutor.executeWebhookTriggeredFlow(webhookContext, trigger, flow);
        } catch (execErr) {
          console.error('Webhook trigger flow execution failed:', requestId, execErr);
          await storage.updateWebhookTriggerLogByRequestId(requestId, {
            status: 'failed',
            errorMessage: execErr instanceof Error ? execErr.message : 'Flow execution failed'
          }).catch(() => {});
          sendWebhookTriggerError(res, 500, 'Flow execution failed', requestId);
          return;
        }

        const responseConfig = getResponseConfig(trigger);
        const duration = Date.now() - startTime;

        webhookTriggerMetrics.totalRequests++;
        webhookTriggerMetrics.byTriggerId.set(trigger.id, (webhookTriggerMetrics.byTriggerId.get(trigger.id) ?? 0) + 1);
        webhookTriggerMetrics.byIp.set(ip, (webhookTriggerMetrics.byIp.get(ip) ?? 0) + 1);
        webhookTriggerMetrics.responseTimes.push(duration);
        if (webhookTriggerMetrics.responseTimes.length > webhookTriggerMetrics.maxResponseTimes) {
          webhookTriggerMetrics.responseTimes.shift();
        }

        const avgTime = webhookTriggerMetrics.responseTimes.length
          ? Math.round(webhookTriggerMetrics.responseTimes.reduce((a, b) => a + b, 0) / webhookTriggerMetrics.responseTimes.length)
          : 0;
        logger.info('WebhookTriggers', 'webhook_trigger_received', {
          requestId,
          triggerId: trigger.id,
          flowId: trigger.flowId,
          durationMs: duration,
          totalRequests: webhookTriggerMetrics.totalRequests,
          avgResponseTimeMs: avgTime
        });

        if (responseConfig.mode === ResponseMode.SYNC && startResult?.executionId) {
          const timeoutMs = Math.min(Math.max(responseConfig.timeout ?? 30000, 1000), 30000);
          try {
            const waitResult = await waitForExecution(startResult.executionId, timeoutMs);
            if (waitResult.status === 'timeout') {
              const timeoutResponse = {
                success: true,
                requestId,
                message: 'Flow execution in progress (timeout)',
                executionId: startResult.executionId
              };
              res.status(202).json(timeoutResponse);
              storage.updateWebhookTriggerLogByRequestId(requestId, {
                responseStatus: 202,
                responseBody: JSON.stringify(timeoutResponse),
                processingTimeMs: Date.now() - startTime
              }).catch((err) => console.error('Webhook trigger log update failed:', requestId, err));
              return;
            }
            const execution = FlowExecutionManager.getInstance().getExecution(startResult.executionId);
            const context = execution?.context;
            if (context) {
              try {
                const webhookResponse = buildWebhookResponse(responseConfig, context, {
                  status: waitResult.status as 'completed' | 'failed',
                  result: waitResult.result,
                  duration: waitResult.duration,
                  error: waitResult.error
                });
                sendWebhookResponse(res, requestId, webhookResponse);
                storage.updateWebhookTriggerLogByRequestId(requestId, {
                  responseStatus: webhookResponse.statusCode,
                  responseBody: webhookResponse.body,
                  processingTimeMs: Date.now() - startTime
                }).catch((err) => console.error('Webhook trigger log update failed:', requestId, err));
              } catch (buildErr) {
                console.error('Webhook response build failed:', requestId, buildErr);
                const fallback = { success: false, error: 'Response template error', requestId };
                res.status(500).json(fallback);
                storage.updateWebhookTriggerLogByRequestId(requestId, {
                  responseStatus: 500,
                  responseBody: JSON.stringify(fallback),
                  processingTimeMs: Date.now() - startTime
                }).catch(() => {});
              }
            } else {
              const fallbackContext = new FlowExecutionContext();
              fallbackContext.setWebhookTriggerVariables(webhookContext);
              fallbackContext.setVariable('flow.id', trigger.flowId);
              fallbackContext.setVariable('flow.name', (flow as { name?: string })?.name ?? '');
              const webhookResponse = buildWebhookResponse(responseConfig, fallbackContext, {
                status: waitResult.status as 'completed' | 'failed',
                error: waitResult.error,
                duration: waitResult.duration
              });
              sendWebhookResponse(res, requestId, webhookResponse);
              storage.updateWebhookTriggerLogByRequestId(requestId, {
                responseStatus: webhookResponse.statusCode,
                responseBody: webhookResponse.body,
                processingTimeMs: Date.now() - startTime
              }).catch((err) => console.error('Webhook trigger log update failed:', requestId, err));
            }
          } catch (waitErr) {
            console.error('Webhook sync wait failed:', requestId, waitErr);
            sendWebhookTriggerError(res, 500, 'Internal server error', requestId);
          }
          return;
        }

        const asyncContext = new FlowExecutionContext();
        asyncContext.setWebhookTriggerVariables(webhookContext);
        asyncContext.setVariable('flow.id', trigger.flowId);
        asyncContext.setVariable('flow.name', (flow as { name?: string })?.name ?? '');
        let webhookResponse;
        try {
          webhookResponse = buildWebhookResponse(responseConfig, asyncContext);
        } catch (buildErr) {
          console.error('Webhook response build failed:', requestId, buildErr);
          webhookResponse = {
            statusCode: 500,
            body: JSON.stringify({ success: false, error: 'Response template error', requestId }),
            headers: { 'Content-Type': 'application/json' },
            contentType: 'application/json'
          };
        }
        sendWebhookResponse(res, requestId, webhookResponse);
        storage.updateWebhookTriggerLogByRequestId(requestId, {
          responseStatus: webhookResponse.statusCode,
          responseBody: webhookResponse.body,
          processingTimeMs: Date.now() - startTime
        }).catch((err) => console.error('Webhook trigger log update failed:', requestId, err));
      } catch (err) {
        console.error('Webhook trigger error', { requestId, error: err instanceof Error ? err.stack : err });
        sendWebhookTriggerError(res, 500, 'Internal server error', requestId);
      }
    }
  );

  /**
   * Webhook Trigger Receiver - Custom path URL
   *
   * Receives webhook events at a custom path (e.g. /shopify/orders, /stripe/payments).
   * The path itself acts as the secret; no token in URL.
   *
   * @route POST /api/webhook/trigger/:customPath(.*)
   * @param {string} customPath - URL-safe path (e.g. shopify/orders)
   * @body {any} payload - The webhook payload (JSON or form-data)
   * @returns {200} Webhook received and queued for processing
   * @returns {400} Invalid custom path format
   * @returns {403} Webhook trigger is disabled
   * @returns {404} Webhook trigger not found for custom path
   * @returns {429} Rate limit exceeded
   * @returns {500} Internal server error
   */
  app.post(
    '/api/webhook/trigger/:customPath(.*)',
    ...webhookTriggerBodyParser,
    createWebhookTriggerRateLimitMiddleware(),
    async (req: express.Request, res: express.Response) => {
      const requestId = crypto.randomUUID();
      const startTime = Date.now();
      const ip = req.ip || (req.socket?.remoteAddress as string) || 'unknown';
      setWebhookTriggerSecurityHeaders(res, requestId);
      setWebhookTriggerCorsHeaders(res);

      try {
        const customPath = req.params.customPath;
        if (!customPath || !CUSTOM_PATH_REGEX.test(customPath)) {
          try {
            await storage.createWebhookTriggerLog({
              requestId,
              triggerId: null,
              flowId: null,
              executionId: null,
              payload: {},
              headers: filterHeadersForLog(req.headers as Record<string, string | string[] | undefined>),
              queryParams: (req.query as Record<string, string>) || {},
              status: 'failed',
              filterResult: null,
              contactId: null,
              conversationId: null,
              responseStatus: 400,
              responseBody: null,
              errorMessage: 'Invalid custom path format',
              ipAddress: ip,
              userAgent: (req.headers['user-agent'] as string) || '',
              processingTimeMs: Date.now() - startTime
            });
          } catch (_) { /* ignore */ }
          return sendWebhookTriggerError(res, 400, 'Invalid custom path format', requestId);
        }

        const trigger = await storage.getWebhookTriggerByCustomPath(customPath);
        if (!trigger) {
          try {
            await storage.createWebhookTriggerLog({
              requestId,
              triggerId: null,
              flowId: null,
              executionId: null,
              payload: {},
              headers: filterHeadersForLog(req.headers as Record<string, string | string[] | undefined>),
              queryParams: (req.query as Record<string, string>) || {},
              status: 'failed',
              filterResult: null,
              contactId: null,
              conversationId: null,
              responseStatus: 404,
              responseBody: null,
              errorMessage: 'Webhook trigger not found for custom path',
              ipAddress: ip,
              userAgent: (req.headers['user-agent'] as string) || '',
              processingTimeMs: Date.now() - startTime
            });
          } catch (_) { /* ignore */ }
          return sendWebhookTriggerError(res, 404, 'Webhook trigger not found for custom path', requestId);
        }

        if (!trigger.isActive) {
          try {
            await storage.createWebhookTriggerLog({
              requestId,
              triggerId: trigger.id,
              flowId: trigger.flowId,
              executionId: null,
              payload: {},
              headers: filterHeadersForLog(req.headers as Record<string, string | string[] | undefined>),
              queryParams: (req.query as Record<string, string>) || {},
              status: 'failed',
              filterResult: null,
              contactId: null,
              conversationId: null,
              responseStatus: 403,
              responseBody: null,
              errorMessage: 'Webhook trigger is disabled',
              ipAddress: ip,
              userAgent: (req.headers['user-agent'] as string) || '',
              processingTimeMs: Date.now() - startTime
            });
          } catch (_) { /* ignore */ }
          return sendWebhookTriggerError(res, 403, 'Webhook trigger is disabled', requestId);
        }

        const company = await storage.getCompany(trigger.companyId);
        if (!company || !company.active) {
          try {
            await storage.createWebhookTriggerLog({
              requestId,
              triggerId: trigger.id,
              flowId: trigger.flowId,
              executionId: null,
              payload: {},
              headers: filterHeadersForLog(req.headers as Record<string, string | string[] | undefined>),
              queryParams: (req.query as Record<string, string>) || {},
              status: 'failed',
              filterResult: null,
              contactId: null,
              conversationId: null,
              responseStatus: 403,
              responseBody: null,
              errorMessage: 'Company is inactive or suspended',
              ipAddress: ip,
              userAgent: (req.headers['user-agent'] as string) || '',
              processingTimeMs: Date.now() - startTime
            });
          } catch (_) { /* ignore */ }
          return sendWebhookTriggerError(res, 403, 'Company is inactive or suspended', requestId);
        }

        const bodyFields = req.body ?? {};
        const files = (req as express.Request & { files?: Express.Multer.File[] }).files;
        const payload = Array.isArray(files) && files.length > 0
          ? { ...bodyFields, _files: files.map((f: Express.Multer.File) => ({ fieldname: f.fieldname, originalname: f.originalname, mimetype: f.mimetype, size: f.size })) }
          : bodyFields;
        const safePayload = limitPayloadDepth(payload, MAX_JSON_DEPTH) as Record<string, unknown>;
        const headers = filterHeadersForLog(req.headers as Record<string, string | string[] | undefined>);
        const queryParams = (req.query as Record<string, string>) || {};
        const userAgent = (req.headers['user-agent'] as string) || '';

        try {
          await storage.createWebhookTriggerLog({
            requestId,
            triggerId: trigger.id,
            flowId: trigger.flowId,
            executionId: null,
            payload: safePayload,
            headers,
            queryParams,
            status: 'received',
            filterResult: null,
            contactId: null,
            conversationId: null,
            responseStatus: null,
            responseBody: null,
            errorMessage: null,
            ipAddress: ip,
            userAgent,
            processingTimeMs: null
          });
        } catch (logErr) {
          console.error('Webhook trigger log create failed:', requestId, logErr);
          return sendWebhookTriggerError(res, 500, 'Internal server error', requestId);
        }

        const webhookPayload: WebhookPayload = {
          body: safePayload,
          headers,
          queryParams,
          method: req.method,
          path: req.path,
          ipAddress: ip,
          userAgent
        };
        const webhookContext = await webhookTriggerProcessor.processWebhook(requestId, trigger, webhookPayload);
        if (!webhookContext) {
          const response = {
            success: true,
            requestId,
            message: 'Webhook received but filtered or failed processing'
          };
          const duration = Date.now() - startTime;
          res.status(200).json(response);
          storage.updateWebhookTriggerLogByRequestId(requestId, {
            responseStatus: 200,
            responseBody: JSON.stringify(response),
            processingTimeMs: duration
          }).catch((err) => console.error('Webhook trigger log update failed:', requestId, err));
          return;
        }

        const flow = await storage.getFlow(trigger.flowId);
        if (!flow) {
          await storage.updateWebhookTriggerLogByRequestId(requestId, { status: 'failed', errorMessage: 'Flow not found' });
          return sendWebhookTriggerError(res, 404, 'Flow not found', requestId);
        }
        if (flow.status === 'draft') {
          await storage.updateWebhookTriggerLogByRequestId(requestId, { status: 'failed', errorMessage: 'Flow is in draft mode' });
          return sendWebhookTriggerError(res, 403, 'Flow is in draft mode', requestId);
        }

        let startResult: { executionId: string } | null = null;
        try {
          startResult = await flowExecutor.executeWebhookTriggeredFlow(webhookContext, trigger, flow);
        } catch (execErr) {
          console.error('Webhook trigger flow execution failed:', requestId, execErr);
          await storage.updateWebhookTriggerLogByRequestId(requestId, {
            status: 'failed',
            errorMessage: execErr instanceof Error ? execErr.message : 'Flow execution failed'
          }).catch(() => {});
          sendWebhookTriggerError(res, 500, 'Flow execution failed', requestId);
          return;
        }

        const responseConfig = getResponseConfig(trigger);
        const duration = Date.now() - startTime;

        webhookTriggerMetrics.totalRequests++;
        webhookTriggerMetrics.byTriggerId.set(trigger.id, (webhookTriggerMetrics.byTriggerId.get(trigger.id) ?? 0) + 1);
        webhookTriggerMetrics.byIp.set(ip, (webhookTriggerMetrics.byIp.get(ip) ?? 0) + 1);
        webhookTriggerMetrics.responseTimes.push(duration);
        if (webhookTriggerMetrics.responseTimes.length > webhookTriggerMetrics.maxResponseTimes) {
          webhookTriggerMetrics.responseTimes.shift();
        }

        const avgTime = webhookTriggerMetrics.responseTimes.length
          ? Math.round(webhookTriggerMetrics.responseTimes.reduce((a, b) => a + b, 0) / webhookTriggerMetrics.responseTimes.length)
          : 0;
        logger.info('WebhookTriggers', 'webhook_trigger_received', {
          requestId,
          triggerId: trigger.id,
          flowId: trigger.flowId,
          durationMs: duration,
          totalRequests: webhookTriggerMetrics.totalRequests,
          avgResponseTimeMs: avgTime
        });

        if (responseConfig.mode === ResponseMode.SYNC && startResult?.executionId) {
          const timeoutMs = Math.min(Math.max(responseConfig.timeout ?? 30000, 1000), 30000);
          try {
            const waitResult = await waitForExecution(startResult.executionId, timeoutMs);
            if (waitResult.status === 'timeout') {
              const timeoutResponse = {
                success: true,
                requestId,
                message: 'Flow execution in progress (timeout)',
                executionId: startResult.executionId
              };
              res.status(202).json(timeoutResponse);
              storage.updateWebhookTriggerLogByRequestId(requestId, {
                responseStatus: 202,
                responseBody: JSON.stringify(timeoutResponse),
                processingTimeMs: Date.now() - startTime
              }).catch((err) => console.error('Webhook trigger log update failed:', requestId, err));
              return;
            }
            const execution = FlowExecutionManager.getInstance().getExecution(startResult.executionId);
            const context = execution?.context;
            if (context) {
              try {
                const webhookResponse = buildWebhookResponse(responseConfig, context, {
                  status: waitResult.status as 'completed' | 'failed',
                  result: waitResult.result,
                  duration: waitResult.duration,
                  error: waitResult.error
                });
                sendWebhookResponse(res, requestId, webhookResponse);
                storage.updateWebhookTriggerLogByRequestId(requestId, {
                  responseStatus: webhookResponse.statusCode,
                  responseBody: webhookResponse.body,
                  processingTimeMs: Date.now() - startTime
                }).catch((err) => console.error('Webhook trigger log update failed:', requestId, err));
              } catch (buildErr) {
                console.error('Webhook response build failed:', requestId, buildErr);
                const fallback = { success: false, error: 'Response template error', requestId };
                res.status(500).json(fallback);
                storage.updateWebhookTriggerLogByRequestId(requestId, {
                  responseStatus: 500,
                  responseBody: JSON.stringify(fallback),
                  processingTimeMs: Date.now() - startTime
                }).catch(() => {});
              }
            } else {
              const fallbackContext = new FlowExecutionContext();
              fallbackContext.setWebhookTriggerVariables(webhookContext);
              fallbackContext.setVariable('flow.id', trigger.flowId);
              fallbackContext.setVariable('flow.name', (flow as { name?: string })?.name ?? '');
              const webhookResponse = buildWebhookResponse(responseConfig, fallbackContext, {
                status: waitResult.status as 'completed' | 'failed',
                error: waitResult.error,
                duration: waitResult.duration
              });
              sendWebhookResponse(res, requestId, webhookResponse);
              storage.updateWebhookTriggerLogByRequestId(requestId, {
                responseStatus: webhookResponse.statusCode,
                responseBody: webhookResponse.body,
                processingTimeMs: Date.now() - startTime
              }).catch((err) => console.error('Webhook trigger log update failed:', requestId, err));
            }
          } catch (waitErr) {
            console.error('Webhook sync wait failed:', requestId, waitErr);
            sendWebhookTriggerError(res, 500, 'Internal server error', requestId);
          }
          return;
        }

        const asyncContext = new FlowExecutionContext();
        asyncContext.setWebhookTriggerVariables(webhookContext);
        asyncContext.setVariable('flow.id', trigger.flowId);
        asyncContext.setVariable('flow.name', (flow as { name?: string })?.name ?? '');
        let webhookResponse;
        try {
          webhookResponse = buildWebhookResponse(responseConfig, asyncContext);
        } catch (buildErr) {
          console.error('Webhook response build failed:', requestId, buildErr);
          webhookResponse = {
            statusCode: 500,
            body: JSON.stringify({ success: false, error: 'Response template error', requestId }),
            headers: { 'Content-Type': 'application/json' },
            contentType: 'application/json'
          };
        }
        sendWebhookResponse(res, requestId, webhookResponse);
        storage.updateWebhookTriggerLogByRequestId(requestId, {
          responseStatus: webhookResponse.statusCode,
          responseBody: webhookResponse.body,
          processingTimeMs: Date.now() - startTime
        }).catch((err) => console.error('Webhook trigger log update failed:', requestId, err));
      } catch (err) {
        console.error('Webhook trigger error', { requestId, error: err instanceof Error ? err.stack : err });
        sendWebhookTriggerError(res, 500, 'Internal server error', requestId);
      }
    }
  );

  app.post('/api/webhooks/webchat',
    express.json(),
    async (req, res) => {
      try {
        const payload = req.body;
        const { token } = payload || {};


        const connection = await webchatService.verifyWidgetToken(token);
        if (!connection) {
          return res.status(401).json({ error: 'Invalid token' });
        }

        await webchatService.processWebhook(payload, connection.companyId);
        res.status(200).send('OK');
      } catch (error) {
        res.status(500).send('Internal Server Error');
      }
    }
  );

  app.get('/api/webhooks/whatsapp', async (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];


    if (mode !== 'subscribe' || typeof token !== 'string' || !token || typeof challenge !== 'string') {

      return res.status(403).send('Forbidden');
    }

    try {

      const whatsappConnections = await storage.getChannelConnectionsByType('whatsapp_official');
      
      let matchingConnection = null;
      for (const connection of whatsappConnections) {
        const connectionData = connection.connectionData as any;
        if (connectionData?.verifyToken === token) {
          matchingConnection = connection;
          break;
        }
      }


      const globalToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
      const isGlobalMatch = !!globalToken && token === globalToken;

      const partner = await storage.getPartnerConfiguration('meta');
      const isPartnerMatch = partner?.isActive && !!partner.webhookVerifyToken && token === partner.webhookVerifyToken;
      if (matchingConnection || isGlobalMatch || isPartnerMatch) {
                res.status(200).send(challenge);
      } else {
       
        res.status(403).send('Forbidden');
      }
    } catch (error) {
      res.status(500).send('Internal Server Error');
    }
  });


  app.post('/api/webhooks/twilio/sms',
    express.urlencoded({ extended: false }),
    async (req, res) => {







      
      try {
        const signature = req.get('x-twilio-signature') as string | undefined;
        
        const fullUrl = `${getPublicBaseUrlFromRequest(req)}${req.originalUrl}`;
        


        
        const result = await twilioSmsService.processInboundWebhook(fullUrl, req.body as any, signature);
        



        
        return res.sendStatus(result.status);
      } catch (error) {
        return res.sendStatus(500);
      }
    }
  );


  app.post('/api/webhooks/twilio/sms-status',
    express.urlencoded({ extended: false }),
    async (req, res) => {




      
      try {
        const signature = req.get('x-twilio-signature') as string | undefined;
        
        const fullUrl = `${getPublicBaseUrlFromRequest(req)}${req.originalUrl}`;
        



        
        const result = await twilioSmsService.processStatusWebhook(fullUrl, req.body as any, signature);
        


        
        return res.sendStatus(result.status);
      } catch (error) {
        return res.sendStatus(500);
      }
    }
  );

  /**
   * Call Agent Health Check Endpoint
   * Super admins: full access. Company admins: their company's connections only (channelId or companyId required).
   */
  app.get('/api/call-agent/health', ensureAuthenticated, ensureCallAgentHealthAccess, async (req, res) => {
    const startTime = Date.now();
    const healthScope = (req as any).healthScope as 'full' | 'company';
    const healthCompanyId = (req as any).healthCompanyId as number | undefined;
    const isSuperAdmin = healthScope === 'full';

    logger.info('call-agent', 'Health check accessed', { userId: (req as any).user?.id, scope: healthScope, companyId: healthCompanyId ?? null });

    let twilioTestResult = { status: 'unknown', responseTime: 0, headers: {} as Record<string, string> };
    let elevenLabsTestResult = { status: 'unknown', responseTime: 0, headers: {} as Record<string, string> };
    let twilioVoiceSDKTestResult = { status: 'unknown', responseTime: 0, message: '' };
    
    const companyIdParam = req.query.companyId ? parseInt(req.query.companyId as string) : null;
    const channelId = req.query.channelId ? parseInt(req.query.channelId as string) : null;
    
    if (healthScope === 'company') {
      if (!channelId && !companyIdParam) {
        return res.status(400).json({ error: 'Company scope requires channelId or companyId query parameter' });
      }
      if (companyIdParam && companyIdParam !== healthCompanyId) {
        return res.status(403).json({ error: 'Access denied: company filter does not match your company' });
      }
    }
    
    let accountSid: string | undefined;
    let authToken: string | undefined;
    let apiKey: string | undefined;
    let apiSecret: string | undefined;
    let twimlAppSid: string | undefined;
    let elevenLabsApiKey: string | undefined;
    let elevenLabsAgentId: string | undefined;
    let credentialSource = 'global';
    
    if (channelId) {
      try {
        const connection = await storage.getChannelConnection(channelId);
        if (connection && connection.connectionData) {
          if (healthScope === 'company' && connection.companyId !== healthCompanyId) {
            return res.status(403).json({ error: 'Access denied: connection does not belong to your company' });
          }
          const connectionData = connection.connectionData as any;
          accountSid = connectionData.accountSid;
          authToken = connectionData.authToken;
          apiKey = connectionData.apiKey;
          apiSecret = connectionData.apiSecret;
          twimlAppSid = connectionData.twimlAppSid;
          elevenLabsApiKey = connectionData.elevenLabsApiKey;
          elevenLabsAgentId = connectionData.elevenLabsAgentId;
          credentialSource = `channel-${channelId}`;
        }
      } catch (error) {
        console.error('[CallAgent] Error loading channel connection:', error);
      }
    }
    
    if (!accountSid || !authToken) {
      if (isSuperAdmin) {
        accountSid = process.env.TWILIO_ACCOUNT_SID;
        authToken = process.env.TWILIO_AUTH_TOKEN;
        apiKey = process.env.TWILIO_API_KEY;
        apiSecret = process.env.TWILIO_API_SECRET;
        twimlAppSid = process.env.TWILIO_TWIML_APP_SID;
        elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
        elevenLabsAgentId = process.env.ELEVENLABS_AGENT_ID;
        credentialSource = 'global';
      } else {
        return res.status(400).json({ error: 'Provide channelId to check a Twilio Voice connection, or use super admin for global health' });
      }
    }
    
    const sanitizedCredentialSource = credentialSource.startsWith('channel-') 
      ? 'channel-specific' 
      : (isSuperAdmin ? credentialSource : 'company');
    
    try {
      const activeCalls = callAgentService.getActiveCalls();
      const circuitBreakerState = getCircuitBreakerState();
      
      // Active Twilio REST API connectivity test
      if (accountSid && authToken) {
        try {
          const twilioStart = Date.now();
          const twilioResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`, {
            headers: {
              'Authorization': callAgentService.getTwilioAuthHeader?.(accountSid, authToken) || ''
            },
            signal: AbortSignal.timeout(5000) // 5 second timeout
          });
          twilioTestResult.responseTime = Date.now() - twilioStart;
          
          // Capture response headers
          twilioResponse.headers.forEach((value, key) => {
            if (key.startsWith('twilio-')) {
              twilioTestResult.headers[key] = value;
            }
          });
          
          twilioTestResult.status = twilioResponse.ok ? 'connected' : 'error';
        } catch (error) {
          twilioTestResult.status = 'error';
          console.error('[CallAgent] Twilio connectivity test failed:', error);
        }
      }
      
      // Test Voice SDK credentials (API Key, Secret, TwiML App)
      if (apiKey && apiSecret && accountSid) {
        try {
          const voiceSDKStart = Date.now();
          // Validate API Key and Secret can generate a valid access token
          const twilio = await import('twilio');
          const AccessToken = twilio.jwt.AccessToken;
          const VoiceGrant = AccessToken.VoiceGrant;
          
          const voiceGrant = new VoiceGrant({
            outgoingApplicationSid: twimlAppSid || 'test',
            incomingAllow: true
          });
          
          const token = new AccessToken(
            accountSid,
            apiKey,
            apiSecret,
            { identity: 'health-check', ttl: 60 }
          );
          token.addGrant(voiceGrant);
          
          const jwt = token.toJwt();
          twilioVoiceSDKTestResult.responseTime = Date.now() - voiceSDKStart;
          
          if (jwt && jwt.length > 0) {
            twilioVoiceSDKTestResult.status = 'valid';
            twilioVoiceSDKTestResult.message = 'Voice SDK credentials can generate valid tokens';
            
            // Verify TwiML App SID exists if provided
            if (twimlAppSid) {
              try {
                const appResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Applications/${twimlAppSid}.json`, {
                  headers: {
                    'Authorization': callAgentService.getTwilioAuthHeader?.(accountSid, authToken || '') || ''
                  },
                  signal: AbortSignal.timeout(3000)
                });
                if (!appResponse.ok) {
                  twilioVoiceSDKTestResult.message = 'Voice SDK credentials valid but TwiML App SID not found';
                }
              } catch (error) {
                twilioVoiceSDKTestResult.message = 'Could not verify TwiML App SID';
              }
            }
          } else {
            twilioVoiceSDKTestResult.status = 'error';
            twilioVoiceSDKTestResult.message = 'Failed to generate Voice SDK token';
          }
        } catch (error) {
          twilioVoiceSDKTestResult.status = 'error';
          twilioVoiceSDKTestResult.message = error instanceof Error ? error.message : 'Voice SDK credential test failed';
        }
      } else {
        twilioVoiceSDKTestResult.status = 'not_configured';
        twilioVoiceSDKTestResult.message = 'Voice SDK credentials not configured';
      }
      
      // Enhanced ElevenLabs health check
      if (elevenLabsApiKey) {
        try {
          const elevenLabsStart = Date.now();
          
          // Test user endpoint
          const userResponse = await fetch('https://api.elevenlabs.io/v1/user', {
            headers: {
              'xi-api-key': elevenLabsApiKey
            },
            signal: AbortSignal.timeout(5000) // 5 second timeout
          });
          
          // Test agent configuration if agent ID is available
          let agentTestResult = { status: 'unknown' };
          if (elevenLabsAgentId) {
            try {
              const agentResponse = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${elevenLabsAgentId}`, {
                headers: {
                  'xi-api-key': elevenLabsApiKey
                },
                signal: AbortSignal.timeout(3000) // 3 second timeout
              });
              agentTestResult.status = agentResponse.ok ? 'valid' : 'invalid';
            } catch (error) {
              agentTestResult.status = 'error';
            }
          }
          
          elevenLabsTestResult.responseTime = Date.now() - elevenLabsStart;
          elevenLabsTestResult.status = userResponse.ok ? 'connected' : 'error';
          
          // Capture response headers
          userResponse.headers.forEach((value, key) => {
            if (key.startsWith('x-ratelimit')) {
              elevenLabsTestResult.headers[key] = value;
            }
          });
        } catch (error) {
          elevenLabsTestResult.status = 'error';
          console.error('[CallAgent] ElevenLabs connectivity test failed:', error);
        }
      } else {
        elevenLabsTestResult.status = 'not_configured';
      }
      
      // Calculate overall status
      let overallStatus = 'healthy';
      if (circuitBreakerState.isOpen || 
          twilioTestResult.status === 'error' || 
          elevenLabsTestResult.status === 'error' ||
          (twilioVoiceSDKTestResult.status === 'error' && channelId)) {
        overallStatus = 'unhealthy';
      } else if (twilioTestResult.status === 'unknown' || 
                 elevenLabsTestResult.status === 'unknown' ||
                 twilioVoiceSDKTestResult.status === 'unknown') {
        overallStatus = 'degraded';
      }
      
      // Count active connections by type and gather metrics
      let twilioConnections = 0;
      let elevenLabsConnections = 0;
      let totalRtt = 0;
      let rttCount = 0;
      let totalPacketLoss = 0;
      let packetLossCount = 0;
      
      for (const [callSid, callData] of activeCalls.entries()) {
        if (callData.twilioWs?.readyState === 1) {
          twilioConnections++;
        }
        if (callData.elevenLabsWs?.readyState === 1) {
          elevenLabsConnections++;
        }
        
        // Collect call quality metrics if available
        if (callData.metrics) {
          if (callData.metrics.rtt) {
            totalRtt += callData.metrics.rtt;
            rttCount++;
          }
          if (callData.metrics.packetLossRate !== undefined) {
            totalPacketLoss += callData.metrics.packetLossRate;
            packetLossCount++;
          }
        }
      }

      // Conference metrics (cached 60s in scheduler, 5s timeout for external API)
      let conferenceMetrics: {
        activeCount: number;
        totalToday: number;
        averageDuration: number;
        longestRunning: { conferenceSid: string; duration: number; participantCount: number } | null;
        staleCount: number;
        cleanupStats: { lastCleanup: string | null; totalCleaned: number; errors: number };
      } = {
        activeCount: 0,
        totalToday: 0,
        averageDuration: 0,
        longestRunning: null,
        staleCount: 0,
        cleanupStats: { lastCleanup: null, totalCleaned: 0, errors: 0 }
      };
      try {
        const metricsPromise = conferenceCleanupScheduler.getConferenceMetrics();
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Conference metrics timeout')), 5000)
        );
        conferenceMetrics = await Promise.race([metricsPromise, timeoutPromise]);
      } catch (err) {
        conferenceMetrics.cleanupStats = conferenceCleanupScheduler.getCleanupStats();
      }
      
      const callQualityData = isSuperAdmin ? (() => {
        const aggregate = callQualityMonitor.getAggregateMetrics();
        return {
          averageLatency: rttCount > 0 ? Math.round(totalRtt / rttCount) : aggregate.averageRttMs,
          packetLossRate: packetLossCount > 0 ? Math.round((totalPacketLoss / packetLossCount) * 100) / 100 : aggregate.averagePacketLossRate,
          totalCallsMeasured: Math.max(rttCount, packetLossCount, aggregate.callCount),
          reconnectionCount: aggregate.totalReconnections,
          fallbackCount: aggregate.totalFallbacks
        };
      })() : undefined;

      const recommendations: string[] = [];
      if (circuitBreakerState.isOpen) {
        recommendations.push('Circuit breaker is open - waiting for recovery before retrying operations');
      }
      if (twilioTestResult.status === 'error') {
        recommendations.push('Twilio connectivity issue - check credentials and network connectivity');
      }
      if (elevenLabsTestResult.status === 'error') {
        recommendations.push('ElevenLabs connectivity issue - verify API key and service status');
      }
      if (callQualityData && callQualityData.averageLatency > 500) {
        recommendations.push('High latency detected - consider checking network quality');
      }
      if (callQualityData && callQualityData.packetLossRate > 5) {
        recommendations.push('High packet loss detected - network quality may be affecting call quality');
      }
      if (conferenceMetrics.staleCount > 10) {
        recommendations.push('High stale conference count - consider running manual conference cleanup');
      }
      if (conferenceMetrics.longestRunning && conferenceMetrics.longestRunning.duration > 4 * 3600) {
        recommendations.push('Long-running conference detected - consider setting max conference duration');
      }

      const healthMetrics: Record<string, unknown> = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        responseTime: Date.now() - startTime,
        credentialSource: sanitizedCredentialSource,
        activeConnections: isSuperAdmin ? callAgentService.getActiveCalls().length : undefined,
        twilio: {
          status: twilioTestResult.status,
          activeConnections: isSuperAdmin ? twilioConnections : undefined,
          responseTime: twilioTestResult.responseTime,
          ...(isSuperAdmin && { headers: twilioTestResult.headers }),
          testTimestamp: new Date().toISOString()
        },
        twilioVoiceSDK: {
          status: twilioVoiceSDKTestResult.status,
          responseTime: twilioVoiceSDKTestResult.responseTime,
          message: twilioVoiceSDKTestResult.message,
          testTimestamp: new Date().toISOString()
        },
        elevenLabs: {
          status: elevenLabsTestResult.status,
          activeConnections: isSuperAdmin ? elevenLabsConnections : undefined,
          responseTime: elevenLabsTestResult.responseTime,
          ...(isSuperAdmin && { headers: elevenLabsTestResult.headers }),
          testTimestamp: new Date().toISOString()
        },
        circuitBreaker: {
          state: (circuitBreakerState as any).state ?? (circuitBreakerState.isOpen ? 'open' : 'closed'),
          isOpen: circuitBreakerState.isOpen,
          failureCount: circuitBreakerState.failureCount,
          failureCountByType: (circuitBreakerState as any).failureCountByType ?? {},
          nextAttemptTime: circuitBreakerState.nextAttemptTime,
          nextAttemptTimeReadable: circuitBreakerState.nextAttemptTime ? new Date(circuitBreakerState.nextAttemptTime).toISOString() : null
        },
        callQuality: callQualityData,
        system: isSuperAdmin ? {
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          version: process.env.npm_package_version || '1.0.0',
          nodeVersion: process.version
        } : undefined,
        conferences: isSuperAdmin ? conferenceMetrics : undefined,
        recommendations
      };

      res.json(healthMetrics);
    } catch (error) {
      console.error('[CallAgent] Health check error:', error);
      res.status(500).json({
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
        responseTime: Date.now() - startTime,
        credentialSource: sanitizedCredentialSource
      });
    }
  });

  /**
   * Per-channel health check endpoint
   * Companies can use this to validate their channel-specific configuration
   * Eliminates redirect overhead by setting query parameters directly
   */
  app.get('/api/call-agent/health/:channelId', async (req, res) => {
    const channelId = parseInt(req.params.channelId);
    const user = req.user;
    
    if (!user || !user.companyId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    if (isNaN(channelId)) {
      return res.status(400).json({ error: 'Invalid channel ID' });
    }
    
    // Set query parameters and call health check logic directly
    req.query.channelId = channelId.toString();
    req.query.companyId = user.companyId.toString();
    
    // Call the health check handler by reusing the same logic
    // Since we can't easily call another route handler, we'll preserve query params in redirect
    // but use a more efficient approach: preserve existing query params
    const queryParams = new URLSearchParams(req.query as any);
    queryParams.set('channelId', channelId.toString());
    queryParams.set('companyId', user.companyId.toString());
    const healthUrl = `/api/call-agent/health?${queryParams.toString()}`;
    return res.redirect(healthUrl);
  });

  /**
   * Call Agent Stream Status Webhook
   * Handles Twilio stream lifecycle events
   */
  app.post('/api/webhooks/call-agent/stream-status',
    express.urlencoded({ extended: false }),
    async (req, res) => {
      try {
        const signature = req.headers['x-twilio-signature'] as string;
        const streamSid = req.body.StreamSid;
        const callSid = req.body.CallSid;
        const event = req.body.Event; // stream-started, stream-stopped, stream-error
        const streamStatus = req.body.StreamStatus;
        const errorCode = req.body.ErrorCode;
        const errorMessage = req.body.ErrorMessage;

        // Extract custom parameters
        const callId = req.body.ParameterCallId;
        const conversationId = req.body.ParameterConversationId;
        const callType = req.body.ParameterCallType;
        const companyId = req.body.ParameterCompanyId;
        const agentId = req.body.ParameterAgentId;
        const audioFormat = req.body.ParameterAudioFormat;

        // Verify Twilio signature
        const fullUrl = `${getPublicBaseUrlFromRequest(req)}${req.originalUrl}`;
        const callData = callAgentService.getActiveCall(callSid);
        
        if (callData && signature) {
          const isValid = callAgentService.verifyTwilioCallSignature(
            fullUrl,
            req.body as Record<string, string>,
            signature,
            callData.config.twilioAuthToken
          );
          
          if (!isValid) {
            console.warn(`[CallAgent] Invalid signature for stream status webhook on call ${callSid}`);
            return res.status(403).send('Forbidden');
          }
        }

        // Log stream status event
        console.log(`[CallAgent] Stream status event for call ${callSid}:`, {
          event,
          streamSid,
          streamStatus,
          callId,
          conversationId,
          callType,
          errorCode,
          errorMessage
        });

        // Update call logs with stream status
        if (callData) {
          // Store stream metadata in call data
          (callData as any).streamMetadata = {
            streamSid,
            callId,
            conversationId,
            callType,
            companyId,
            agentId,
            audioFormat,
            startTime: event === 'stream-started' ? new Date() : (callData as any).streamMetadata?.startTime,
            endTime: event === 'stream-stopped' ? new Date() : undefined,
            status: streamStatus,
            errorCode,
            errorMessage
          };

          // Emit WebSocket event for real-time UI updates
          try {
            CallLogsEventEmitter.emitCallStatusUpdate(
              parseInt(callId),
              parseInt(companyId) || 0,
              event,
              {
                streamSid,
                sequenceNumber: 0,
                timestamp: new Date().toISOString(),
              }
            );
          } catch (wsError) {
            console.error(`[CallAgent] Error emitting WebSocket event:`, wsError);
          }
        }

        // Handle specific events
        switch (event) {
          case 'stream-started':
            console.log(`[CallAgent] Stream started for call ${callSid} (Stream SID: ${streamSid})`);
            break;
            
          case 'stream-stopped':
            console.log(`[CallAgent] Stream stopped for call ${callSid} (Stream SID: ${streamSid})`);
            break;
            
          case 'stream-error':
            console.error(`[CallAgent] Stream error for call ${callSid}:`, { errorCode, errorMessage });
            
            // Emit callError event for UI
            if (callData && (callData as any).flowContext) {
              try {
                const { conversationId } = (callData as any).flowContext;
                const callLogsResult = await callLogsService.getCallLogs(0, {});
                const callLog = callLogsResult.calls.find(c => c.twilioCallSid === callSid);
                if (callLog) {
                  CallLogsEventEmitter.emitCallError(
                    callLog.id,
                    callLog.companyId || 0,
                    {
                      type: 'stream_error',
                      details: errorMessage || `Stream error code: ${errorCode}`
                    }
                  );
                }
              } catch (wsError) {
                console.error(`[CallAgent] Failed to emit callError event:`, wsError);
              }
            }
            break;
        }

        res.type('text/xml');
        res.send('<Response/>');
      } catch (error) {
        console.error('[CallAgent] Error handling stream status webhook:', error);
        res.status(500).send('Internal Server Error');
      }
    }
  );

  const callAgentStatusUrlencoded = express.urlencoded({ extended: false });

  /**
   * Shared handler for Twilio call status callbacks (used by both call-agent/status and twilio/voice-status)
   */
  async function handleTwilioCallStatusWebhook(req: express.Request, res: express.Response): Promise<void> {
    const startTime = Date.now();
      let hasError = false;
      let errorDetails: any = {};
      
      try {
        // Validate required fields
        if (!req.body) {
          throw new Error('Request body is empty');
        }
        
        const signature = req.headers['x-twilio-signature'] as string;
        const callSid = req.body.CallSid;
        const callStatus = req.body.CallStatus;
        const callDuration = req.body.CallDuration;
        const recordingUrl = req.body.RecordingUrl;
        const errorCode = req.body.ErrorCode;
        const errorMessage = req.body.ErrorMessage;
        
        // Validate call SID
        if (!callSid || typeof callSid !== 'string') {
          throw new Error('Invalid or missing CallSid');
        }
        
        // Validate call status
        if (!callStatus || typeof callStatus !== 'string') {
          throw new Error('Invalid or missing CallStatus');
        }
        
        // Normalize call status
        const normalizedStatus = callStatus.toLowerCase().replace(/[-_]/g, '');
        const validStatuses = ['queued', 'initiated', 'ringing', 'inprogress', 'completed', 'failed', 'busy', 'noanswer', 'canceled'];
        
        if (!validStatuses.includes(normalizedStatus)) {
          console.warn(`[CallAgent] Unusual call status received: ${callStatus}`);
          // Continue processing but log the unusual status
        }

        const fromField = String(req.body.From || req.body.Caller || '');
        const isAgentSideLeg = fromField.startsWith('client:');

        // Verify Twilio signature (public URL from shared helper; token from active call or voice channel)
        const fullUrl = `${getPublicBaseUrlFromRequest(req)}${req.originalUrl}`;

        const callData = callAgentService.getActiveCall(callSid);
        console.log('[CallAgent][DEBUG] Webhook URL for sig validation:', fullUrl, '| sig present:', !!signature, '| callData found:', !!callData);

        let authToken: string | undefined = callData?.config?.twilioAuthToken;
        if (!authToken && signature) {
          authToken = await resolveTwilioAuthTokenFromVoiceConnections(
            req.body.From || req.body.Caller,
            req.body.To || req.body.Called
          );
        }

        if (signature) {
          if (process.env.NODE_ENV === 'production' && !authToken) {
            console.error('[CallAgent] Status webhook: signature present but no Twilio auth token resolved');
            res.status(403).send('Forbidden');
            return;
          } else if (process.env.NODE_ENV !== 'production' && !authToken) {
            console.warn('[CallAgent] Skipping signature validation (non-production environment)');
          }
          if (authToken) {
            const isValid = callAgentService.verifyTwilioCallSignature(
              fullUrl,
              req.body as Record<string, string>,
              signature,
              authToken
            );
            console.log('[CallAgent][DEBUG] Signature valid:', isValid, '| callSid:', callSid);

            if (!isValid) {
              console.error('[CallAgent] Invalid Twilio signature for status webhook');
              logger.error('call-agent', 'Webhook signature validation failed');
              console.log('[CallAgent] Signature validation details:', {
                callSid,
                signature: signature.substring(0, 10) + '...',
                url: fullUrl,
                timestamp: new Date().toISOString()
              });
              res.status(403).send('Forbidden');
              return;
            }
          }
        }

        // Update call status in active calls and database
        console.log(`[CallAgent] Call ${callSid} status update: ${callStatus}`);
        
        // Parse and validate duration
        let durationSec: number | undefined;
        if (callDuration) {
          const parsed = parseInt(callDuration);
          if (!isNaN(parsed) && parsed >= 0) {
            durationSec = parsed;
          } else {
            console.warn(`[CallAgent] Invalid call duration: ${callDuration}`);
          }
        }
        
        // Validate recording URL
        let validatedRecordingUrl: string | undefined;
        if (recordingUrl) {
          try {
            const url = new URL(recordingUrl);
            if (url.protocol === 'https:' || url.protocol === 'http:') {
              validatedRecordingUrl = recordingUrl;
            } else {
              console.warn(`[CallAgent] Invalid recording URL protocol: ${recordingUrl}`);
            }
          } catch (e) {
            console.warn(`[CallAgent] Invalid recording URL format: ${recordingUrl}`);
          }
        }
        
                // Find call log by twilioCallSid
                const { call: upsertedCall, created: callLogCreated } = await callLogsService.upsertCallLog({
                  twilioCallSid: callSid,
                  status: callStatus,
                  durationSec,
                  endedAt: ['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(callStatus) ? new Date() : undefined,
                  recordingUrl: validatedRecordingUrl,
                  recordingSid: req.body.RecordingSid ? String(req.body.RecordingSid) : undefined,
                  startedAt: callStatus === 'in-progress'
                    ? (req.body.Timestamp ? new Date(req.body.Timestamp) : new Date())
                    : undefined
                });
                let existingCall: typeof upsertedCall | null = upsertedCall;
                if (callLogCreated && isAgentSideLeg) {
                  await callLogsService.deleteOrphanCallLogById(upsertedCall.id);
                  existingCall = null;
                  console.log('[CallAgent] Discarded new call log row for agent SDK leg:', callSid);
                }
                console.log('[CallAgent][DEBUG] upsertCallLog result:', {
                  callId: existingCall?.id,
                  companyId: existingCall?.companyId,
                  channelId: existingCall?.channelId,
                  twilioCallSid: existingCall?.twilioCallSid,
                  status: existingCall?.status,
                  createdNewRow: callLogCreated,
                  discardedAgentLeg: callLogCreated && isAgentSideLeg
                });

        let resolvedCompanyId: number = Number(existingCall?.companyId) || 0;
        if (resolvedCompanyId === 0 && existingCall) {
          try {
            if (existingCall.channelId) {
              const channelConnection = await storage.getChannelConnection(existingCall.channelId);
              const candidate = Number(channelConnection?.companyId);
              if (Number.isInteger(candidate) && candidate > 0) {
                resolvedCompanyId = candidate;
              }
            }
            if (resolvedCompanyId === 0 && existingCall.contactId) {
              const contact = await storage.getContact(existingCall.contactId);
              const candidate = Number(contact?.companyId);
              if (Number.isInteger(candidate) && candidate > 0) {
                resolvedCompanyId = candidate;
              }
            }
            if (resolvedCompanyId === 0 && existingCall.conversationId) {
              const conversation = await storage.getConversation(existingCall.conversationId);
              const candidate = Number(conversation?.companyId);
              if (Number.isInteger(candidate) && candidate > 0) {
                resolvedCompanyId = candidate;
              }
            }
            if (resolvedCompanyId === 0 && callData?.config) {
              const candidate = Number((callData.config as any).companyId);
              if (Number.isInteger(candidate) && candidate > 0) {
                resolvedCompanyId = candidate;
              }
            }
            // Last resort: look up company from phone numbers in the webhook payload for calls created without companyId (e.g., calls initiated outside the standard flow).
            if (resolvedCompanyId === 0) {
              const fromNumber = req.body.From || req.body.Caller;
              const toNumber = req.body.To || req.body.Called;
              if (fromNumber || toNumber) {
                try {
                  const voiceConnections = await storage.getChannelConnectionsByType('twilio_voice');
                  for (const conn of voiceConnections) {
                    const connData = conn.connectionData as any;
                    const connFrom = connData?.fromNumber || connData?.phoneNumber;
                    if (connFrom && (connFrom === fromNumber || connFrom === toNumber)) {
                      const candidate = Number(conn.companyId);
                      if (Number.isInteger(candidate) && candidate > 0) {
                        resolvedCompanyId = candidate;
                        console.log(`[CallAgent] Resolved companyId ${resolvedCompanyId} from voice channel connection phone match`);
                        break;
                      }
                    }
                  }
                } catch (err) {
                  console.warn('[CallAgent] Error resolving companyId from phone numbers:', err);
                }
              }
            }
            if (resolvedCompanyId > 0 && resolvedCompanyId !== (existingCall.companyId ?? undefined)) {
              await callLogsService.upsertCallLog({ twilioCallSid: callSid, companyId: resolvedCompanyId });
              const source = existingCall.channelId ? 'channelId' : existingCall.contactId ? 'contactId' : 'conversationId';
              console.warn(`[CallAgent] Resolved companyId ${resolvedCompanyId} for call ${callSid} from ${source}`);
            }
          } catch (err) {
            console.warn(`[CallAgent] Error resolving companyId for call ${callSid}:`, err);
          }
        }
        console.log('[CallAgent][DEBUG] resolvedCompanyId:', resolvedCompanyId, '| existingCall.id:', existingCall?.id);

        // Determine if this is a terminal state
        const terminalStates = ['completed', 'failed', 'busy', 'no-answer', 'canceled'];
        const isTerminal = terminalStates.includes(callStatus);
        const isFailure = ['failed', 'busy', 'no-answer', 'canceled'].includes(callStatus);

        // Emit status update for every status change (in-progress, ringing, queued, completed, etc.)
        // so the call screen can transition to in-progress and start the timer when the callee answers.
        // Only emit when resolvedCompanyId is a positive integer so broadcasts are never dropped with company id 0.
        if (existingCall && Number.isInteger(resolvedCompanyId) && resolvedCompanyId > 0) {
          console.log('[CallAgent][DEBUG] Emitting callStatusUpdate:', {
            callId: existingCall.id,
            companyId: resolvedCompanyId,
            status: callStatus
          });
          CallLogsEventEmitter.emitCallStatusUpdate(
            existingCall.id,
            resolvedCompanyId,
            callStatus,
            {
              callSid,
              startedAt: existingCall.startedAt ?? undefined,
              durationSec,
            }
          );
        }

        if (existingCall && isTerminal) {
          // Extract transcript if call completed
          if (callStatus === 'completed') {
            try {
              const transcript = callAgentService.extractTranscript(callSid);
              
              // Update call log with transcript
              await callLogsService.upsertCallLog({
                twilioCallSid: callSid,
                transcript: transcript.turns,
                conversationData: transcript.turns
              });

              // Save transcript to conversation if flow context exists
              if (callData && (callData as any).flowContext) {
                const { conversationId } = (callData as any).flowContext;
                
                try {
                  // Save full conversation transcript as a message
                  await storage.createMessage({
                    conversationId,
                    content: transcript.fullText,
                    direction: 'inbound',
                    type: 'text',
                    metadata: {
                      callSid,
                      duration: callDuration,
                      recordingUrl,
                      userUtterances: transcript.userUtterances,
                      aiResponses: transcript.aiResponses,
                      turns: transcript.turns
                    }
                  });
                  
                  console.log(`[CallAgent] Transcript saved to conversation ${conversationId}`);
                } catch (error) {
                  console.error(`[CallAgent] Error saving transcript:`, error);
                }
              }
            } catch (error) {
              console.error(`[CallAgent] Error extracting transcript:`, error);
            }
          }

          // Emit appropriate event (only when resolvedCompanyId is a positive integer)
          if (Number.isInteger(resolvedCompanyId) && resolvedCompanyId > 0) {
          if (isFailure) {
            // Include error details in failure event
            const failureReason = errorCode ? `Error ${errorCode}: ${errorMessage || 'Unknown error'}` : `Call ${callStatus}`;
            
            CallLogsEventEmitter.emitCallFailed(
              existingCall.id,
              resolvedCompanyId,
              failureReason
            );
            
            // Emit detailed error event for UI
            if (errorCode || errorMessage) {
              console.warn(`[CallAgent] Detailed error for call ${existingCall.id}:`, {
                type: errorCode ? 'twilio_error' : 'call_failed',
                code: errorCode,
                message: errorMessage || callStatus,
                callSid,
                callStatus,
                timestamp: new Date().toISOString()
              });
            }
          } else {
            CallLogsEventEmitter.emitCallCompleted(
              existingCall.id,
              resolvedCompanyId,
              {
                status: callStatus,
                duration: durationSec || 0
              }
            );
          }
          }

          // Cleanup call data
          if (callData) {
            callAgentService.removeActiveCall(callSid);
          }
        }

        if (!existingCall && !(callLogCreated && isAgentSideLeg)) {
          // Handle case where call log doesn't exist (omit noise for intentionally discarded agent SDK legs)
          console.warn(`[CallAgent] Received status for unknown call: ${callSid}`);
          
          // Log the anomaly for debugging
          logger.warn('call-agent', 'Unknown call status received');
          console.log('[CallAgent] Status details:', {
            callSid,
            callStatus,
            timestamp: new Date().toISOString()
          });
        }
        
        res.type('text/xml');
        res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
        
        // Log successful processing
        const processingTime = Date.now() - startTime;
        if (processingTime > 1000) {
          console.warn(`[CallAgent] Slow webhook processing: ${processingTime}ms for call ${callSid}`);
        }
        
      } catch (error: any) {
        hasError = true;
        errorDetails = {
          message: error.message,
          stack: error.stack,
          callSid: req.body.CallSid,
          callStatus: req.body.CallStatus,
          timestamp: new Date().toISOString()
        };
        
        console.error('[CallAgent] Error processing status webhook:', error);
        
        // Log structured error
        logger.error('call-agent', 'Webhook processing error');
        console.log('[CallAgent] Error details:', errorDetails);
        
        // Return appropriate error response
        if (error.message.includes('Invalid')) {
          res.status(400).send('Bad Request');
        } else {
          res.status(500).send('Internal Server Error');
        }
      } finally {
        // Log webhook processing metrics
        const processingTime = Date.now() - startTime;
        console.log(`[CallAgent] Webhook processed in ${processingTime}ms (Error: ${hasError})`);
      }
  }

  /** Call Agent Status Webhook - primary path */
  app.post('/api/webhooks/call-agent/status', callAgentStatusUrlencoded, handleTwilioCallStatusWebhook);

  /**
   * Twilio recording status callback (Call REST Record= and Conference record-from-start).
   * Persists concrete RecordingSid + media URL and notifies subscribed clients.
   */
  async function handleTwilioRecordingStatusWebhook(req: express.Request, res: express.Response): Promise<void> {
    try {
      if (!req.body) {
        res.status(400).send('Bad Request');
        return;
      }
      const signature = req.headers['x-twilio-signature'] as string;
      const recordingSid = req.body.RecordingSid ? String(req.body.RecordingSid) : '';
      const recordingStatus = req.body.RecordingStatus ? String(req.body.RecordingStatus) : '';
      const callSid = req.body.CallSid ? String(req.body.CallSid) : '';
      const conferenceSid = req.body.ConferenceSid ? String(req.body.ConferenceSid) : '';
      const accountSid = req.body.AccountSid ? String(req.body.AccountSid) : '';

      if (!recordingSid) {
        res.status(400).send('Bad Request');
        return;
      }

      const fullUrl = `${getPublicBaseUrlFromRequest(req)}${req.originalUrl}`;
      let authToken: string | undefined =
        (callSid ? callAgentService.getActiveCall(callSid)?.config?.twilioAuthToken : undefined) ||
        (accountSid ? await resolveTwilioAuthTokenFromAccountSid(accountSid) : undefined);
      if (!authToken && (req.body.From || req.body.To)) {
        authToken = await resolveTwilioAuthTokenFromVoiceConnections(req.body.From, req.body.To);
      }

      if (signature) {
        if (process.env.NODE_ENV === 'production' && !authToken) {
          console.error('[CallAgent] Recording webhook: signature present but auth token unresolved');
          res.status(403).send('Forbidden');
          return;
        } else if (process.env.NODE_ENV !== 'production' && !authToken) {
          console.warn('[CallAgent] Recording webhook: skipping signature validation (non-production)');
        } else if (authToken) {
          const valid = callAgentService.verifyTwilioCallSignature(
            fullUrl,
            req.body as Record<string, string>,
            signature,
            authToken
          );
          if (!valid) {
            logger.error('call-agent', 'Recording webhook signature validation failed');
            res.status(403).send('Forbidden');
            return;
          }
        }
      }

      const existing = await callLogsService.findCallLogForTwilioRecording({
        callSid: callSid || undefined,
        conferenceSid: conferenceSid || undefined
      });
      if (!existing?.twilioCallSid) {
        console.warn('[CallAgent] Recording webhook: no call log for', { callSid, conferenceSid, recordingSid });
        res.type('text/xml');
        res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
        return;
      }

      let recordingUrl = req.body.RecordingUrl ? String(req.body.RecordingUrl).trim() : '';
      if (!recordingUrl && accountSid && recordingSid && authToken) {
        const resolved = await resolveTwilioRecordingMediaUrl(accountSid, authToken, recordingSid);
        if (resolved) recordingUrl = resolved;
      }

      let validatedUrl: string | undefined;
      if (recordingUrl) {
        try {
          const u = new URL(recordingUrl);
          if (u.protocol === 'https:' || u.protocol === 'http:') validatedUrl = recordingUrl;
        } catch {
          /* ignore */
        }
      }

      const prevMeta = (existing.metadata as Record<string, unknown>) || {};
      const mergedMetadata = {
        ...prevMeta,
        twilioRecordingStatus: recordingStatus,
        twilioRecordingSid: recordingSid,
        lastRecordingStatusAt: new Date().toISOString()
      };

      const { call: updated } = await callLogsService.upsertCallLog({
        twilioCallSid: existing.twilioCallSid,
        recordingSid,
        recordingUrl: validatedUrl,
        metadata: mergedMetadata as any
      });

      const companyId = Number(updated.companyId) || 0;
      if (companyId > 0) {
        CallLogsEventEmitter.emitCallStatusUpdate(updated.id, companyId, updated.status || 'in-progress', {
          recordingUrl: validatedUrl,
          recordingSid,
          callSid: existing.twilioCallSid
        });
      }

      res.type('text/xml');
      res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    } catch (e) {
      console.error('[CallAgent] Recording webhook error:', e);
      res.status(500).send('Internal Server Error');
    }
  }

  app.post('/api/webhooks/twilio/recording-status', callAgentStatusUrlencoded, handleTwilioRecordingStatusWebhook);

  /**
   * Twilio Voice Status Callback URL (alias used by connection settings / diagnostics)
   * Same handler as call-agent/status so user-configured statusCallbackUrl works.
   */
  app.head('/api/webhooks/twilio/voice-status', (_req, res) => res.status(200).end());
  app.post('/api/webhooks/twilio/voice-status', callAgentStatusUrlencoded, handleTwilioCallStatusWebhook);

  /** Telnyx Call Control voice events (raw JSON body + Ed25519 verification in handler) */
  app.head('/api/webhooks/telnyx/voice', (_req, res) => res.status(200).end());
  app.post('/api/webhooks/telnyx/voice', handleTelnyxVoiceWebhook);

  /**
   * Call Agent Inbound Call Webhook
   * Handles inbound calls and initiates flow execution
   */
  app.post('/api/webhooks/call-agent/inbound/:flowId/:nodeId',
    express.urlencoded({ extended: false }),
    async (req, res) => {
      try {
        const signature = req.headers['x-twilio-signature'] as string;
        const flowId = req.params.flowId;
        const nodeId = req.params.nodeId;
        const callSid = req.body.CallSid;
        const fromNumber = req.body.From;
        const toNumber = req.body.To;

        // Verify Twilio signature
        // Retrieve auth token from flow/node configuration or env fallback
        const fullUrl = `${getPublicBaseUrlFromRequest(req)}${req.originalUrl}`;
        
        // Retrieve flow to get company ID
        const flow = await storage.getFlow(parseInt(flowId));
        if (!flow) {
          console.error(`[CallAgent] Flow ${flowId} not found`);
          return res.type('text/xml').send(
            '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Configuration error. Please contact support.</Say><Hangup/></Response>'
          );
        }
        
        if (!flow.companyId) {
          console.error(`[CallAgent] Flow ${flowId} has no companyId`);
          return res.type('text/xml').send(
            '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Configuration error. Please contact support.</Say><Hangup/></Response>'
          );
        }
        
        // Query for the company's active Twilio Voice channel connection
        const twilioVoiceConnections = await storage.getChannelConnectionsByCompany(flow.companyId);
        const channelConnection = twilioVoiceConnections.find(
          conn => conn.channelType === 'twilio_voice' && conn.status === 'active'
        );
        
        if (!channelConnection) {
          console.error(`[CallAgent] No active Twilio Voice channel connection found for company ${flow.companyId}`);
          return res.type('text/xml').send(
            '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Configuration error. Please contact support.</Say><Hangup/></Response>'
          );
        }
        
        // Extract credentials from channel connection - no fallback to .env
        const connectionData = channelConnection.connectionData as any;
        const twilioAuthToken = connectionData?.authToken;
        const twilioAccountSid = connectionData?.accountSid;
        const elevenLabsApiKey = connectionData?.elevenLabsApiKey;
        const elevenLabsAgentId = connectionData?.elevenLabsAgentId;
        
        // Validate required credentials
        if (!twilioAuthToken || !twilioAccountSid) {
          console.error(`[CallAgent] Missing Twilio credentials in channel connection for company ${flow.companyId}`);
          return res.type('text/xml').send(
            '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Configuration error. Please contact support.</Say><Hangup/></Response>'
          );
        }
        
        // Verify Twilio signature
        if (signature && twilioAuthToken) {
          const isValid = callAgentService.verifyTwilioCallSignature(
            fullUrl,
            req.body as Record<string, string>,
            signature,
            twilioAuthToken
          );
          
          if (!isValid) {
            console.error('[CallAgent] Invalid Twilio signature for inbound webhook');
            return res.status(403).send('Forbidden');
          }
        } else if (signature && !twilioAuthToken) {
          console.error('[CallAgent] Twilio signature provided but no auth token configured');
          return res.status(403).send('Forbidden');
        }
        
        // Extract node configuration for optional overrides (advanced use case)
        const nodes = flow.nodes as any[] || [];
        const node = nodes.find((n: any) => n.id === nodeId);
        
        // Allow flow node to override credentials if explicitly configured (advanced use case)
        // But never fall back to .env
        const finalTwilioAuthToken = node?.data?.twilioAuthToken || twilioAuthToken;
        const finalTwilioAccountSid = node?.data?.twilioAccountSid || twilioAccountSid;
        const finalElevenLabsApiKey = node?.data?.elevenLabsApiKey || elevenLabsApiKey;
        const finalElevenLabsAgentId = node?.data?.elevenLabsAgentId || elevenLabsAgentId;
        
        const hasElevenLabs = !!(finalElevenLabsApiKey && finalElevenLabsApiKey.trim() !== '');
        
        // Variables to track ElevenLabs registration
        let elevenLabsConversationId: string | undefined;
        let streamUrl = '';
        
        // Register with ElevenLabs if configured
        if (hasElevenLabs && finalElevenLabsAgentId) {
          try {
            console.log(`[CallAgent] Starting ElevenLabs registration for inbound call ${callSid}`);
            const { getElevenLabsSignedUrl } = await import('./services/call-agent-service');
            const signedResult = await getElevenLabsSignedUrl(finalElevenLabsApiKey, finalElevenLabsAgentId);
            streamUrl = signedResult.signedUrl;
            elevenLabsConversationId = signedResult.conversationId;
            console.log(`[CallAgent] ElevenLabs registration successful for inbound call, conversation ID: ${elevenLabsConversationId || 'N/A'}`);
          } catch (error: any) {
            console.error(`[CallAgent] ElevenLabs registration failed for inbound call, falling back to direct call:`, error.message);
            // Continue with basic TwiML (no stream)
          }
        } else if (hasElevenLabs && !finalElevenLabsAgentId) {
          console.log(`[CallAgent] ElevenLabs API key configured but no agent ID for inbound call - using custom prompt configuration`);
          // Fallback to temp URL for custom prompts
          const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 
                                process.env.PUBLIC_URL?.replace(/^https?:\/\//, '') ||
                                req.get('host') || 'localhost:3000';
          streamUrl = `wss://${webhookBaseUrl}/call-agent/stream/${callSid}`;
        }
        
        // If no ElevenLabs or registration failed, use basic TwiML
        if (!streamUrl && !hasElevenLabs) {
          console.log(`[CallAgent] No ElevenLabs configured for inbound call ${callSid} - using basic TwiML`);
        }

        // Generate TwiML response with Media Stream if ElevenLabs is configured
        const agentConfig = {
          elevenLabsConversationId,
          hasElevenLabs: !!(streamUrl && hasElevenLabs)
        };
        const twiml = callAgentService.generateInboundTwiML(streamUrl, agentConfig);

        res.type('text/xml');
        res.send(twiml);

        // Initiate flow execution for inbound call
        try {
          // Flow already retrieved above for signature verification
          // Ensure companyId is available
          if (!flow.companyId) {
            console.error(`[CallAgent] Flow ${flowId} has no companyId`);
            return;
          }
          
          // Create or find contact based on phone number
          let contact = await storage.getContactByPhone(fromNumber, flow.companyId);
          if (!contact) {
            contact = await storage.createContact({
              phone: fromNumber,
              companyId: flow.companyId,
              name: `Caller ${fromNumber}`,
              source: 'call_agent'
            });
          }
          
          // Create conversation for this call
          // Use the channel connection ID found above
          const conversation = await storage.createConversation({
            contactId: contact.id,
            companyId: flow.companyId,
            channelType: 'twilio_voice',
            channelId: channelConnection.id,
            status: 'open'
          });
          
          // Store call data with conversation context
          callAgentService.setActiveCall(callSid, {
            config: {
              // Use credentials from channel connection or node overrides (no .env fallback)
              twilioAccountSid: finalTwilioAccountSid,
              twilioAuthToken: finalTwilioAuthToken,
              twilioFromNumber: node?.data?.twilioFromNumber || toNumber,
              elevenLabsApiKey: finalElevenLabsApiKey,
              elevenLabsAgentId: finalElevenLabsAgentId,
              elevenLabsPrompt: node?.data?.elevenLabsPrompt || node?.data?.customAgentPrompt,
              elevenLabsVoiceId: node?.data?.voiceId || node?.data?.voiceSettings?.voiceId,
              elevenLabsModel: node?.data?.voiceSettings?.model,
              audioFormat: node?.data?.audioFormat || 'ulaw_8000',
              toNumber: fromNumber,
              executionMode: 'async'
            } as any,
            conversationData: [],
            startTime: new Date(),
            flowContext: {
              flowId: parseInt(flowId),
              nodeId,
              conversationId: conversation.id,
              contactId: contact.id
            },
            elevenLabsConversationId
          } as any);
          
          console.log(`[CallAgent] Inbound call ${callSid} linked to conversation ${conversation.id}`);
        } catch (error) {
          console.error(`[CallAgent] Error initiating flow for inbound call:`, error);
        }
      } catch (error) {
        console.error('[CallAgent] Error processing inbound call webhook:', error);
        res.status(500).send('Internal Server Error');
      }
    }
  );

  app.post('/api/webhooks/whatsapp', createWhatsAppWebhookSecurity(), express.raw({ type: 'application/json', limit: '50mb' }), async (req, res) => {
    try {
      await acceptWhatsAppWebhook(req.body, req.headers['x-hub-signature-256']);
      res.status(200).send('OK');
    } catch (error: any) {
      res.status(error.status || 500).send(error.status ? error.message : 'Webhook persistence failed');
    }
  });


  /**
   * Instagram webhook verification endpoint (GET)
   */
  app.get('/api/webhooks/instagram', async (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode !== 'subscribe') {
      return res.status(403).send('Forbidden');
    }

    try {
      const instagramConnections = await storage.getChannelConnectionsByType('instagram');
      let matchingConnection = null;
      for (const connection of instagramConnections) {
        const connectionData = connection.connectionData as any;
        if (connectionData?.verifyToken === token) {
          matchingConnection = connection;
          break;
        }
      }

      const globalToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;
      const isGlobalMatch = globalToken && token === globalToken;
      const isPartnerConfigMatch = await matchesActiveMetaPartnerWebhookVerifyToken(token);
      const directConfig = await storage.getPartnerConfiguration('instagram');
      const isDirectMatch = typeof token === 'string' && !!token && !!directConfig?.webhookVerifyToken && token === directConfig.webhookVerifyToken;

      if (matchingConnection || isGlobalMatch || isPartnerConfigMatch || isDirectMatch) {
        res.status(200).send(challenge);
      } else {
        logger.warn('instagram-webhook', 'Verify token mismatch', {
          endpoint: '/api/webhooks/instagram',
          channel: 'instagram',
          hasMatchingConnection: false,
          hasGlobalMatch: !!isGlobalMatch,
          hasPartnerConfigMatch: !!isPartnerConfigMatch,
        });
        res.status(403).send('Forbidden');
      }
    } catch (error) {
      res.status(500).send('Internal Server Error');
    }
  });


  app.post('/api/webhooks/instagram',
    express.raw({ type: 'application/json' }),
    async (req, res) => {
    try {
      const signature = req.headers['x-hub-signature-256'] as string;
      const body = req.body;

      if (!Buffer.isBuffer(body)) {
        return res.status(400).send('Invalid request body - expected raw body');
      }

      const rawPayload = body.toString();
      const payload = JSON.parse(rawPayload);

      if (!signature && !isMetaWebhookSignatureBypassAllowed()) {
        logger.warn('instagram-webhook', 'Rejecting request: missing x-hub-signature-256 header', {
          endpoint: '/api/webhooks/instagram',
          channel: 'instagram',
        });
        return res.status(401).send('Unauthorized');
      }

      let targetConnection = null;
      let entryAccountId: string | null = null;
      const entryAccountIds = payload?.entry && Array.isArray(payload.entry)
        ? payload.entry
            .map((entry: any) => entry?.id != null ? String(entry.id) : null)
            .filter((id: string | null): id is string => !!id)
        : [];
      const instagramConnections = await storage.getChannelConnectionsByType('instagram');
      if (payload?.entry && Array.isArray(payload.entry) && payload.entry.length > 0) {
        entryAccountId = entryAccountIds[0] || null;

        if (entryAccountIds.length > 0) {
          targetConnection = instagramConnections.find((conn: any) => {
            const connectionData = conn.connectionData as any;
            return entryAccountIds.some((id: string) =>
              String(connectionData?.instagramAccountId || '') === id ||
              String(conn.accountId || '') === id
            );
          }) || null;
        }
      }

      if (!targetConnection) {
        logger.warn('instagram-webhook', 'No matching Instagram account connection', {
          entryId: entryAccountId,
          entryIds: entryAccountIds,
          channel: 'instagram',
          companyMatchStatus: 'unmatched',
          checkedConnections: instagramConnections.map((conn: any) => ({
            connectionId: conn.id,
            instagramAccountId: (conn.connectionData as any)?.instagramAccountId ?? null,
            accountId: conn.accountId ?? null,
            companyId: conn.companyId,
            status: conn.status,
          })),
        });
      }

      if (signature) {
        const connectionData = targetConnection?.connectionData as any;
        const appSecret = connectionData?.appSecret;
        const partnerConfig = !appSecret ? await storage.getPartnerConfiguration(connectionData?.authMethod === 'instagram_login' ? 'instagram' : 'meta') : null;
        if (!appSecret && !partnerConfig?.partnerSecret) {
          logger.warn('instagram-webhook', 'App secret unavailable for signature verification', {
            channel: 'instagram',
            entryId: entryAccountId,
            entryIds: entryAccountIds,
            connectionId: targetConnection?.id ?? null,
            partnerConfigFallbackExists: !!partnerConfig,
          });
        }
      }

      await instagramService.processWebhook(
        payload,
        signature,
        undefined, // Each signed entry resolves its own company/account.
        rawPayload
      );

      res.status(200).send('OK');
    } catch (error: any) {
      const fbtraceId = error?.response?.data?.error?.fbtrace_id;
      if (
        error instanceof Error &&
        (error.message.includes('x-hub-signature-256') ||
          error.message.includes('webhook signature'))
      ) {
        return res.status(401).send('Unauthorized');
      }
      logger.error('instagram-webhook', 'Error processing Instagram webhook', {
        channel: 'instagram',
        error: error instanceof Error ? error.message : String(error),
        fbtraceId: fbtraceId ?? null,
      });
      res.status(500).send('Internal Server Error');
    }
  });



  /**
   * TikTok webhook verification endpoint (GET)
   * TikTok sends a verification request when setting up webhooks
   */
  app.get('/api/webhooks/tiktok', async (req, res) => {
    try {
      const challenge = typeof req.query['challenge'] === 'string' ? req.query['challenge'] : Array.isArray(req.query['challenge']) ? req.query['challenge'][0] : undefined;
      const verifyToken = typeof req.query['verify_token'] === 'string' ? req.query['verify_token'] : Array.isArray(req.query['verify_token']) ? req.query['verify_token'][0] : undefined;

      try {
        const platformConfig = await TikTokService.getPlatformConfig();
        const expectedToken = platformConfig.webhookSecret;

        if (expectedToken && verifyToken === expectedToken) {
          logWebhookSecurityEvent('verification_success', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            endpoint: 'tiktok'
          });
          logger.info('tiktok', 'Webhook verification handshake succeeded');
          return res.status(200).send(challenge ?? '');
        } else {
          logWebhookSecurityEvent('verification_failed', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            endpoint: 'tiktok',
            reason: 'invalid_verify_token'
          });
          logger.warn('tiktok', 'Webhook verification failed: invalid or missing verify_token');
          return res.status(403).send('Forbidden');
        }
      } catch (error) {
        logger.error('tiktok', 'Webhook verification error', { error: error instanceof Error ? error.message : 'Unknown' });
        return res.status(500).send('Internal Server Error');
      }
    } catch (error) {
      res.status(500).send('Internal Server Error');
    }
  });

  /**
   * TikTok webhook event endpoint (POST)
   * Receives webhook events from TikTok Business Messaging API
   */
  app.post('/api/webhooks/tiktok',
    createTikTokWebhookSecurity(),
    express.raw({ type: 'application/json', limit: '50mb' }),
    async (req, res) => {
      const startTime = Date.now();
      let eventType = 'unknown';

      try {
        const signature = req.headers['tiktok-signature'] as string | undefined;
        const body = req.body;
        let rawBodyUtf8 = '';

        const platformConfig = await TikTokService.getPlatformConfig();
        if (!signature) {
          logWebhookSecurityEvent('signature_verification_failed', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            endpoint: 'tiktok',
            reason: 'missing_signature'
          });
          logTikTokWebhookEvent('unknown', 'error', {
            error: 'tiktok-signature header required'
          });
          return res.status(403).send('Forbidden');
        }

        try {
          if (!Buffer.isBuffer(body)) {
            logTikTokWebhookEvent('unknown', 'error', {
              error: 'Invalid request body - expected raw body'
            });
            return res.status(400).send('Invalid request body - expected raw body');
          }

          rawBodyUtf8 = body.toString('utf8');
          const isValid = TikTokService.verifyWebhookSignature(
            rawBodyUtf8,
            signature,
            platformConfig.clientSecret
          );

          if (!isValid) {
            logWebhookSecurityEvent('signature_verification_failed', {
              ip: req.ip,
              userAgent: req.get('User-Agent'),
              endpoint: 'tiktok'
            });
            logTikTokWebhookEvent('unknown', 'error', {
              error: 'Signature verification failed'
            });
            return res.status(403).send('Forbidden');
          }

          logWebhookSecurityEvent('signature_verified', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            endpoint: 'tiktok'
          });
        } catch (error) {
          logTikTokWebhookEvent('unknown', 'error', {
            error: error instanceof Error ? error.message : 'Signature verification error'
          });
          return res.status(500).send('Internal Server Error');
        }

        const payload = JSON.parse(rawBodyUtf8);
        const content = payload.content ?? payload.data ?? {};
        eventType = payload.event ?? payload.event_type ?? payload.type ?? 'unknown';

        logTikTokWebhookEvent(eventType, 'received', {
          payload: payload,
          metadata: {
            hasSignature: true,
            ip: req.ip,
            userAgent: req.get('user-agent'),
            from_user_id: content.from_user_id,
            to_user_id: content.to_user_id,
            conversation_id: content.conversation_id,
            message_id: content.message_id
          }
        });


        if (!payload || typeof payload !== 'object') {
          logTikTokWebhookEvent(eventType, 'error', {
            error: 'Invalid payload structure'
          });
          return res.status(400).json({ error: 'Invalid payload' });
        }

        logTikTokWebhookEvent(eventType, 'processing', {
          metadata: {
            from_user_id: content.from_user_id,
            to_user_id: content.to_user_id,
            conversation_id: content.conversation_id,
            message_id: content.message_id
          }
        });

        res.status(200).send('OK');

        const webhookContext = { ipAddress: req.ip, userAgent: req.get('user-agent') ?? undefined };
        setImmediate(async () => {
          try {
            await TikTokService.processWebhookEvent(payload, webhookContext);
            const processingTimeMs = Date.now() - startTime;
            logTikTokWebhookEvent(eventType, 'success', {
              processingTimeMs,
              metadata: {
                eventType: eventType,
                from_user_id: content.from_user_id,
                to_user_id: content.to_user_id,
                conversation_id: content.conversation_id,
                message_id: content.message_id
              }
            });
          } catch (error) {
            const processingTimeMs = Date.now() - startTime;
            logTikTokWebhookEvent(eventType, 'error', {
              error: error instanceof Error ? error.message : 'Unknown error',
              processingTimeMs,
              metadata: {
                from_user_id: content.from_user_id,
                to_user_id: content.to_user_id,
                conversation_id: content.conversation_id,
                message_id: content.message_id
              }
            });
            logger.error('tiktok', 'Webhook async processing failed (response already sent)', { error: error instanceof Error ? error.message : 'Unknown' });
          }
        });
      } catch (error) {
        const processingTimeMs = Date.now() - startTime;

        logTikTokWebhookEvent(eventType, 'error', {
          error: error instanceof Error ? error.message : 'Unknown error',
          processingTimeMs
        });

        res.status(500).send('Internal Server Error');
      }
    }
  );


  /**
   * Meta WhatsApp Partner webhook verification endpoint (GET)
   * Meta sends a verification request when setting up webhooks
   */
  app.get('/api/webhooks/meta-whatsapp', async (req, res) => {
    const mode = typeof req.query['hub.mode'] === 'string' ? req.query['hub.mode'] : Array.isArray(req.query['hub.mode']) ? req.query['hub.mode'][0] : undefined;
    const token = typeof req.query['hub.verify_token'] === 'string' ? req.query['hub.verify_token'] : Array.isArray(req.query['hub.verify_token']) ? req.query['hub.verify_token'][0] : undefined;
    const challenge = typeof req.query['hub.challenge'] === 'string' ? req.query['hub.challenge'] : Array.isArray(req.query['hub.challenge']) ? req.query['hub.challenge'][0] : undefined;


    if (mode !== 'subscribe') {
      
      return res.status(403).send('Forbidden');
    }

    if (!challenge) {
      return res.status(400).send('Missing challenge parameter');
    }

    try {

      const partnerConfig = await storage.getPartnerConfiguration('meta');
      
      

      if (!partnerConfig || !partnerConfig.isActive) {
        return res.status(404).send('Partner configuration not found or inactive');
      }

      if (!partnerConfig.webhookVerifyToken) {
        return res.status(500).send('Webhook verify token not configured');
      }

      const expectedToken = partnerConfig.webhookVerifyToken;
      const tokenMatch = typeof token === 'string' && token === expectedToken;

    

      if (tokenMatch) {
       
        
        logWebhookSecurityEvent('verification_success', {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          endpoint: 'meta-whatsapp'
        });


        const challengeString = typeof challenge === 'string' ? challenge : String(challenge);
        return res.status(200).send(challengeString);
      } else {
       

        logWebhookSecurityEvent('verification_failed', {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          endpoint: 'meta-whatsapp',
          reason: 'token_mismatch'
        });

        return res.status(403).send('Forbidden');
      }
    } catch (error) {
     
      return res.status(500).send('Internal Server Error');
    }
  });

  /**
   * Meta WhatsApp Partner webhook event endpoint (POST)
   * Receives webhook events from Meta WhatsApp Business API Partner
   */
  app.post('/api/webhooks/meta-whatsapp', express.raw({ type: 'application/json', limit: '50mb' }), async (req, res) => {
    try {
      await acceptWhatsAppWebhook(req.body, req.headers['x-hub-signature-256'], true);
      res.status(200).send('OK');
    } catch (error: any) {
      res.status(error.status || 500).send(error.status ? error.message : 'Webhook persistence failed');
    }
  });

  app.get('/api/webhooks/test', (req, res) => {
    res.json({
      message: 'Webhook routes are working',
      timestamp: new Date().toISOString(),
      registeredBefore: 'JSON middleware'
    });
  });

  /**
   * Debug endpoint for testing Meta WhatsApp webhook signature verification
   * Requires super admin authentication
   */
  app.get('/api/webhooks/meta-whatsapp/debug', ensureSuperAdmin, async (req, res) => {
    try {
      const { testBody, testSignature, testSecret } = req.query;

      if (!testBody || !testSignature || !testSecret) {
        return res.status(400).json({
          error: 'Missing required parameters',
          required: ['testBody', 'testSignature', 'testSecret'],
          received: {
            hasTestBody: !!testBody,
            hasTestSignature: !!testSignature,
            hasTestSecret: !!testSecret
          }
        });
      }

      const timestamp = new Date().toISOString();

      const result = testMetaWebhookSignature(
        testBody as string,
        testSignature as string,
        testSecret as string
      );

      return res.json({
        success: true,
        timestamp,
        result: {
          isValid: result.isValid,
          computedHash: result.computedHash,
          receivedHash: result.receivedHash,
          bodyLength: result.bodyLength,
          secretLength: result.secretLength,
          algorithm: result.algorithm,
          details: result.details
        }
      });
    } catch (error) {
      return res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * Retry Call Endpoint
   * Allows retrying a failed call with the same parameters
   */
  app.post('/api/call-logs/:callId/retry', async (req, res) => {
    const callId = req.params.callId;
    try {
      
      // Get the original call log
      const callLog = await callLogsService.getCallLogById(0, parseInt(callId));
      if (!callLog) {
        return res.status(404).json({
          success: false,
          error: 'Call not found'
        });
      }
      
      // Check if call is in a retryable state
      if (!['failed', 'no-answer', 'busy'].includes(callLog.status)) {
        return res.status(400).json({
          success: false,
          error: 'Call is not in a retryable state'
        });
      }
      
      // Check retry count to prevent infinite retries
      const retryCount = callLog.metadata?.retryCount || 0;
      if (retryCount >= 2) {
        return res.status(429).json({
          success: false,
          error: 'Maximum retry attempts exceeded'
        });
      }
      
      const channelId = callLog.channelId || Number(callLog.metadata?.channelId) || 0;
      if (!channelId) {
        return res.status(400).json({
          success: false,
          error: 'Voice channel connection not found for this call'
        });
      }

      const destinationNumber = callLog.to || callLog.from || '';
      if (!destinationNumber) {
        return res.status(400).json({
          success: false,
          error: 'Original call destination number is unavailable'
        });
      }

      // Get call configuration from channel connection
      const connection = await storage.getChannelConnection(channelId);
      if (!connection) {
        return res.status(400).json({
          success: false,
          error: 'Channel connection not found'
        });
      }
      
      const connectionData = normalizeVoiceChannelConnectionData(connection.connectionData as any);
      const credentialError = getVoiceConnectionCredentialError(connectionData);
      if (credentialError) {
        console.error('[Call Retry] Voice channel connection is missing required credentials');
        return res.status(400).json({
          success: false,
          error: credentialError
        });
      }

      const requestedCallType = callLog.metadata?.callType === 'ai-powered'
        ? 'ai-powered'
        : callLog.metadata?.callType === 'direct'
          ? 'direct'
          : undefined;
      const actualCallType = resolveEffectiveVoiceCallType(connectionData, requestedCallType);
      const aiConfigError = actualCallType === 'ai-powered'
        ? getAiVoiceConfigurationError(connectionData)
        : null;
      if (aiConfigError) {
        return res.status(400).json({
          success: false,
          error: aiConfigError
        });
      }
      
      // Update retry count in metadata
      const updatedMetadata = {
        ...callLog.metadata,
        retryCount: retryCount + 1,
        originalCallId: callLog.id,
        retryTimestamp: new Date().toISOString()
      };
      
      // Get webhook base URL
      const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 
                            process.env.PUBLIC_URL?.replace(/^https?:\/\//, '') ||
                            req.get('host') || 'localhost:3000';
      
      // Initiate new call with provider-aware retry configuration
      const callResult = await dispatchVoiceCall({
        connection: connection as any,
        to: destinationNumber,
        from: connectionData.fromNumber || '',
        requestedCallType,
        webhookBaseUrl,
        twilioConfigFactory: () => ({
          twilioAccountSid: connectionData.accountSid || '',
          twilioAuthToken: connectionData.authToken || '',
          twilioFromNumber: connectionData.fromNumber || '',
          toNumber: destinationNumber,
          elevenLabsApiKey: actualCallType === 'ai-powered' ? (connectionData.elevenLabsApiKey || '') : '',
          elevenLabsAgentId: actualCallType === 'ai-powered' ? connectionData.elevenLabsAgentId : undefined,
          elevenLabsPrompt: actualCallType === 'ai-powered' ? connectionData.elevenLabsPrompt : undefined,
          elevenLabsVoiceId: actualCallType === 'ai-powered' ? connectionData.voiceId : undefined,
          recordCall: true,
          timeout: 30,
          executionMode: 'async'
        })
      });
      const metadataRecord = (callResult.metadata || {}) as Record<string, any>;
      const recordingNormalization = buildCallRecordingFields({
        recordCall: true,
        telephonyProvider: callResult.telephonyProvider,
        callType: callResult.callType,
        elevenLabsNativeOutbound: !!metadataRecord.elevenLabsNativeOutbound
      });
      
      // Update original call log with retry information
      await callLogsService.updateCallLog(0, callLog.id, {
        notes: `Retried at ${new Date().toISOString()}. New call SID: ${callResult.callSid}`,
        metadata: updatedMetadata
      });
      
      // Create new call log entry
      const { call: newCallLog } = await callLogsService.upsertCallLog({
        twilioCallSid: callResult.callSid,
        channelId: connection.id,
        conversationId: callLog.conversationId,
        from: callResult.from,
        to: callResult.to,
        direction: 'outbound',
        status: 'initiated',
        contactId: callLog.contactId,
        companyId: callLog.companyId,
        flowId: callLog.flowId,
        nodeId: callLog.nodeId,
        startedAt: callResult.startTime,
        recordingRequested: recordingNormalization.recordingRequested,
        recordingAudioProvider: recordingNormalization.recordingAudioProvider,
        recordingExpectedFrom: recordingNormalization.recordingExpectedFrom,
        agentConfig: actualCallType === 'ai-powered' ? {
          elevenLabsAgentId: connectionData.elevenLabsAgentId,
          elevenLabsPrompt: connectionData.elevenLabsPrompt,
          voiceId: connectionData.voiceId,
          vapiAssistantId: connectionData.vapiAssistantId
        } : undefined,
        metadata: {
          ...metadataRecord,
          ...updatedMetadata,
          hasElevenLabs: connectionData.providerStack === 'twilio-elevenlabs',
          providerStack: callResult.providerStack,
          providerStackLabel: getVoiceProviderStackLabel(callResult.providerStack),
          callType: callResult.callType,
          conferenceName: metadataRecord.conferenceName,
          supportsBrowserDirect: callResult.supportsBrowserDirect,
          retryOfCallId: callLog.id
        },
        notes: `Retry of call ${callLog.id}`,
        isStarred: false
      });
      
      // Emit WebSocket event for real-time updates
      CallLogsEventEmitter.emitCallStatusUpdate(
        callLog.id,
        callLog.companyId || 0,
        'retrying',
        {
          newCallId: newCallLog.id,
          callSid: callResult.callSid,
          retryCount: retryCount + 1
        }
      );
      
      res.json({
        success: true,
        data: {
          callSid: callResult.callSid,
          callId: newCallLog.id,
          status: 'initiated',
          retryCount: retryCount + 1,
          callType: callResult.callType,
          providerStack: callResult.providerStack,
          supportsBrowserDirect: callResult.supportsBrowserDirect,
          conferenceName: metadataRecord.conferenceName,
          channelId: connection.id
        }
      });
      
    } catch (error) {
      console.error('[CallAgent] Retry call error:', error);
      
      // Emit callError event for UI
      try {
        // Get the original call log to access callId and companyId
        const originalCallLog = await callLogsService.getCallLogById(0, parseInt(callId));
        if (originalCallLog) {
          CallLogsEventEmitter.emitCallError(
            parseInt(callId),
            originalCallLog.companyId || 0,
            {
              type: 'retry_failed',
              details: error instanceof Error ? error.message : 'Failed to retry call'
            }
          );
        }
      } catch (wsError) {
        console.error('[CallAgent] Failed to emit callError event:', wsError);
      }
      
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to retry call'
      });
    }
  });

  /**
   * Fallback to Direct Call Endpoint
   * Switches from AI-powered call to direct call
   */
  app.post('/api/call-logs/:callId/fallback-direct', async (req, res) => {
    const callId = req.params.callId;
    try {
      
      // Get the original call log
      const callLog = await callLogsService.getCallLogById(0, parseInt(callId));
      if (!callLog) {
        return res.status(404).json({
          success: false,
          error: 'Call not found'
        });
      }
      
      // Check if call was AI-powered
      if (callLog.metadata?.callType !== 'ai-powered') {
        return res.status(400).json({
          success: false,
          error: 'Call is not AI-powered'
        });
      }
      
      const channelId = callLog.channelId || Number(callLog.metadata?.channelId) || 0;
      if (!channelId) {
        return res.status(400).json({
          success: false,
          error: 'Voice channel connection not found for this call'
        });
      }

      const destinationNumber = callLog.to || callLog.from || '';
      if (!destinationNumber) {
        return res.status(400).json({
          success: false,
          error: 'Original call destination number is unavailable'
        });
      }

      // Get call configuration from channel connection
      const connection = await storage.getChannelConnection(channelId);
      if (!connection) {
        return res.status(400).json({
          success: false,
          error: 'Channel connection not found'
        });
      }
      
      const connectionData = normalizeVoiceChannelConnectionData(connection.connectionData as any);
      const credentialError = getVoiceConnectionCredentialError(connectionData);
      if (credentialError) {
        console.error('[Call Fallback] Voice channel connection is missing required credentials');
        return res.status(400).json({
          success: false,
          error: credentialError
        });
      }
      
      // Update metadata to reflect fallback
      const updatedMetadata = {
        ...callLog.metadata,
        originalCallType: callLog.metadata.callType,
        callType: 'direct',
        fallbackTimestamp: new Date().toISOString(),
        fallbackReason: 'elevenlabs_unavailable'
      };
      
      // Get webhook base URL
      const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 
                            process.env.PUBLIC_URL?.replace(/^https?:\/\//, '') ||
                            req.get('host') || 'localhost:3000';
      
      // Initiate new direct call using the configured provider stack
      const callResult = await dispatchVoiceCall({
        connection: connection as any,
        to: destinationNumber,
        from: connectionData.fromNumber || '',
        requestedCallType: 'direct',
        webhookBaseUrl,
        twilioConfigFactory: () => ({
          twilioAccountSid: connectionData.accountSid || '',
          twilioAuthToken: connectionData.authToken || '',
          twilioFromNumber: connectionData.fromNumber || '',
          toNumber: destinationNumber,
          elevenLabsApiKey: '',
          elevenLabsAgentId: undefined,
          recordCall: true,
          timeout: 30,
          executionMode: 'async'
        })
      });
      const metadataRecord = (callResult.metadata || {}) as Record<string, any>;
      const recordingNormalization = buildCallRecordingFields({
        recordCall: true,
        telephonyProvider: callResult.telephonyProvider,
        callType: callResult.callType,
        elevenLabsNativeOutbound: !!metadataRecord.elevenLabsNativeOutbound
      });
      
      // Update original call log
      await callLogsService.updateCallLog(0, callLog.id, {
        notes: `Switched to direct call at ${new Date().toISOString()}. New call SID: ${callResult.callSid}`,
        metadata: updatedMetadata
      });
      
      // Create new call log entry
      const { call: newCallLog } = await callLogsService.upsertCallLog({
        twilioCallSid: callResult.callSid,
        conversationId: callLog.conversationId,
        to: callResult.to,
        from: callResult.from,
        direction: 'outbound',
        status: 'initiated',
        channelId: connection.id,
        contactId: callLog.contactId,
        companyId: callLog.companyId,
        flowId: callLog.flowId,
        nodeId: callLog.nodeId,
        startedAt: callResult.startTime,
        recordingRequested: recordingNormalization.recordingRequested,
        recordingAudioProvider: recordingNormalization.recordingAudioProvider,
        recordingExpectedFrom: recordingNormalization.recordingExpectedFrom,
        metadata: {
          ...metadataRecord,
          ...updatedMetadata,
          hasElevenLabs: connectionData.providerStack === 'twilio-elevenlabs',
          providerStack: callResult.providerStack,
          providerStackLabel: getVoiceProviderStackLabel(callResult.providerStack),
          callType: callResult.callType,
          conferenceName: metadataRecord.conferenceName,
          supportsBrowserDirect: callResult.supportsBrowserDirect,
          originalCallId: callLog.id
        },
        notes: `Fallback from AI-powered call`,
        isStarred: false
      });
      
      // Emit WebSocket event for real-time updates
      CallLogsEventEmitter.emitCallStatusUpdate(
        callLog.id,
        callLog.companyId || 0,
        'fallback',
        {
          newCallId: newCallLog.id,
          callSid: callResult.callSid,
          fallbackTo: 'direct'
        }
      );
      
      res.json({
        success: true,
        data: {
          callSid: callResult.callSid,
          callId: newCallLog.id,
          status: 'initiated',
          callType: callResult.callType,
          providerStack: callResult.providerStack,
          supportsBrowserDirect: callResult.supportsBrowserDirect,
          conferenceName: metadataRecord.conferenceName,
          channelId: connection.id
        }
      });
      
    } catch (error) {
      console.error('[CallAgent] Fallback call error:', error);
      
      // Emit callError event for UI
      try {
        // Get the original call log to access callId and companyId
        const originalCallLog = await callLogsService.getCallLogById(0, parseInt(callId));
        if (originalCallLog) {
          CallLogsEventEmitter.emitCallError(
            parseInt(callId),
            originalCallLog.companyId || 0,
            {
              type: 'fallback_failed',
              details: error instanceof Error ? error.message : 'Failed to switch to direct call'
            }
          );
        }
      } catch (wsError) {
        console.error('[CallAgent] Failed to emit callError event:', wsError);
      }
      
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to switch to direct call'
      });
    }
  });

  /**
   * Call Agent Monitoring Dashboard Endpoint
   * Provides comprehensive monitoring data for the call system
   */
  app.get('/api/call-agent/monitoring', ensureSuperAdmin, async (req, res) => {
    try {
      const startTime = Date.now();
      
      // Get active calls and their metrics
      const activeCalls = callAgentService.getActiveCalls();
      const activeCallsData = [];
      let totalRtt = 0;
      let totalPacketLoss = 0;
      let totalJitter = 0;
      let qualityCounts = { excellent: 0, good: 0, fair: 0, poor: 0 };
      
      for (const callData of activeCalls) {
        const metrics = callAgentService.getCallQualityMetrics(callData.callSid);
        const callInfo = {
          callSid: callData.callSid,
          startTime: callData.startTime,
          duration: Math.floor((Date.now() - callData.startTime.getTime()) / 1000),
          turnCount: callData.conversationData?.length || 0,
          metrics: metrics || null,
          hasElevenLabs: !!(callData as any).elevenLabsWs,
          twilioConnected: !!(callData as any).twilioWs
        };
        
        activeCallsData.push(callInfo);
        
        if (metrics) {
          totalRtt += metrics.rtt;
          totalPacketLoss += metrics.packetLossRate;
          totalJitter += metrics.jitter;
          qualityCounts[metrics.audioQuality]++;
        }
      }
      
      // Calculate average quality metrics
      const activeCallsCount = activeCallsData.length;
      const avgMetrics = activeCallsCount > 0 ? {
        rtt: Math.round(totalRtt / activeCallsCount),
        packetLossRate: Math.round(totalPacketLoss / activeCallsCount),
        jitter: Math.round(totalJitter / activeCallsCount)
      } : { rtt: 0, packetLossRate: 0, jitter: 0 };
      
      // Get circuit breaker state
      const circuitBreakerState = getCircuitBreakerState();
      
      // Get recent call statistics
      // Note: Using getCallLogs with date filter since getRecentCallLogs doesn't exist
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      const callLogsResult = await callLogsService.getCallLogs(
        0, // companyId 0 to get all calls for monitoring
        {
          startDate: yesterday.toISOString().split('T')[0],
          endDate: new Date().toISOString().split('T')[0]
        },
        { limit: 100 }
      );
      
      const recentCalls = callLogsResult.calls;
      const callStats = {
        total: recentCalls.length,
        completed: recentCalls.filter(c => c.status === 'completed').length,
        failed: recentCalls.filter(c => c.status === 'failed').length,
        busy: recentCalls.filter(c => c.status === 'busy').length,
        noAnswer: recentCalls.filter(c => c.status === 'no-answer').length,
        avgDuration: recentCalls.reduce((sum, c) => sum + (c.durationSec || 0), 0) / (recentCalls.length || 1)
      };
      
      // Calculate error rates
      const errorRate = callStats.total > 0 ? Math.round((callStats.failed / callStats.total) * 100) : 0;
      const connectionRate = callStats.total > 0 ? Math.round(((callStats.completed + callStats.failed + callStats.busy + callStats.noAnswer) / callStats.total) * 100) : 0;
      
      // Get system health
      const healthCheck = await fetch(`${req.protocol}://${req.get('host')}/api/call-agent/health`, {
        headers: {
          'Authorization': req.headers.authorization || ''
        }
      }).catch(() => null);
      
      let systemHealth = null;
      if (healthCheck?.ok) {
        systemHealth = await healthCheck.json();
      }
      
      // Compile monitoring data
      const monitoringData = {
        timestamp: new Date().toISOString(),
        system: {
          activeCalls: activeCallsCount,
          circuitBreaker: circuitBreakerState,
          health: systemHealth
        },
        quality: {
          average: avgMetrics,
          distribution: qualityCounts,
          activeCalls: activeCallsData.map(c => ({
            callSid: c.callSid,
            duration: c.duration,
            quality: c.metrics?.audioQuality || 'unknown',
            rtt: c.metrics?.rtt || 0,
            packetLoss: c.metrics?.packetLossRate || 0
          }))
        },
        statistics: {
          last24Hours: callStats,
          errorRate,
          connectionRate,
          trends: {
            // Calculate hourly trend for the last 24 hours
            hourly: Array.from({ length: 24 }, (_, i) => {
              const hourStart = new Date();
              hourStart.setHours(hourStart.getHours() - (23 - i), 0, 0, 0);
              const hourEnd = new Date(hourStart);
              hourEnd.setHours(hourEnd.getHours() + 1);
              
              const hourCalls = recentCalls.filter(c => {
                const callTime = new Date(c.createdAt || c.startedAt || 0);
                return callTime >= hourStart && callTime < hourEnd;
              });
              
              return {
                hour: hourStart.getHours(),
                total: hourCalls.length,
                completed: hourCalls.filter(c => c.status === 'completed').length,
                failed: hourCalls.filter(c => c.status === 'failed').length
              };
            })
          }
        },
        alerts: [
          // Generate alerts based on current conditions
          ...(circuitBreakerState.isOpen ? [{
            type: 'circuit_breaker_open',
            severity: 'critical',
            message: 'Circuit breaker is open - calls are being blocked',
            timestamp: new Date().toISOString()
          }] : []),
          ...(errorRate > 20 ? [{
            type: 'high_error_rate',
            severity: 'warning',
            message: `Error rate is ${errorRate}% (threshold: 20%)`,
            timestamp: new Date().toISOString()
          }] : []),
          ...(avgMetrics.packetLossRate > 5 ? [{
            type: 'high_packet_loss',
            severity: 'warning',
            message: `Average packet loss is ${avgMetrics.packetLossRate}%`,
            timestamp: new Date().toISOString()
          }] : []),
          ...(avgMetrics.rtt > 500 ? [{
            type: 'high_latency',
            severity: 'warning',
            message: `Average RTT is ${avgMetrics.rtt}ms`,
            timestamp: new Date().toISOString()
          }] : [])
        ],
        processingTime: Date.now() - startTime
      };
      
      res.json({
        success: true,
        data: monitoringData
      });
      
    } catch (error) {
      console.error('[CallAgent] Error fetching monitoring data:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch monitoring data'
      });
    }
  });

  /**
   * Conference Status Webhook
   * Handles Twilio conference events for direct calls
   */
  app.post('/api/webhooks/conference-status',
    express.urlencoded({ extended: false }),
    async (req, res) => {
      try {
        const {
          ConferenceSid,
          FriendlyName,
          StatusCallbackEvent,
          CallSid,
          Muted,
          Hold,
          EndConferenceOnExit,
          StartConferenceOnEnter,
          SequenceNumber,
          ParticipantLabel
        } = req.body;

        const isFallbackCall = FriendlyName && String(FriendlyName).startsWith('fallback-');
        if (isFallbackCall) {
          console.log(`[Conference Webhook] Fallback call event: ${StatusCallbackEvent}, Conference: ${FriendlyName}`);
        } else {
          console.log(`[Conference Webhook] Event: ${StatusCallbackEvent}, Conference: ${FriendlyName}, CallSid: ${CallSid}, ParticipantLabel: ${ParticipantLabel}`);
        }

        // Find call log by conference name to get callId and companyId
        let callLogs: any[] = [];
        try {
          callLogs = await callLogsService.getCallLogsByConferenceName(FriendlyName);
        } catch (err) {
          console.error('[Conference Webhook] Error finding call logs:', err);
        }

        // Handle different conference events
        switch (StatusCallbackEvent) {
          case 'conference-start':
            console.log(`[Conference Webhook] Conference started: ${FriendlyName}`);
            // Conference has started - customer is in the room. Store ConferenceSid and schedule cleanup using configured max duration.
            let maxConferenceDurationMs: number;
            try {
              const maxHours = await conferenceCleanupScheduler.getMaxConferenceDurationHours();
              maxConferenceDurationMs = maxHours * 60 * 60 * 1000;
            } catch (err) {
              console.error('[Conference Webhook] Error getting max conference duration, using 4h default:', err);
              maxConferenceDurationMs = 4 * 60 * 60 * 1000;
            }
            for (const callLog of callLogs) {
              if (callLog.companyId !== null) {
                const metadata = callLog.metadata || {};
                metadata.conferenceName = FriendlyName;
                metadata.conferenceSid = ConferenceSid;
                metadata.conferenceStartTime = new Date().toISOString();
                metadata.participantJoinTimes = metadata.participantJoinTimes || {};
                metadata.participantLeaveTimes = metadata.participantLeaveTimes || {};
                metadata.participantLabels = metadata.participantLabels || [];
                metadata.cleanupScheduled = true;
                try {
                  await callLogsService.updateCallLog(callLog.companyId, callLog.id, {
                    metadata: metadata
                  });
                  console.log(`[Conference Webhook] Conference start logged for call ${callLog.id}`);
                } catch (err) {
                  console.error(`[Conference Webhook] Error updating metadata for call ${callLog.id}:`, err);
                }
              }
            }
            if (ConferenceSid) {
              try {
                conferenceCleanupScheduler.scheduleConferenceCleanup(ConferenceSid, maxConferenceDurationMs);
              } catch (err) {
                console.error('[Conference Webhook] Error scheduling conference cleanup:', err);
              }
            }
            break;

          case 'conference-end':
            console.log(`[Conference Webhook] Conference ended: ${FriendlyName}`);
            if (ConferenceSid) {
              conferenceCleanupScheduler.cancelConferenceCleanup(ConferenceSid);
            }
            try {
              const conferenceEndTime = new Date().toISOString();
              for (const callLog of callLogs) {
                const timeoutKey = String(callLog.id);
                const existingTimeout = agentJoinTimeoutHandles.get(timeoutKey);
                if (existingTimeout) {
                  clearTimeout(existingTimeout);
                  agentJoinTimeoutHandles.delete(timeoutKey);
                }

                const metadata = callLog.metadata || {};
                metadata.conferenceEndTime = conferenceEndTime;
                const startMs = metadata.conferenceStartTime ? new Date(metadata.conferenceStartTime).getTime() : (callLog.startedAt ? new Date(callLog.startedAt).getTime() : Date.now());
                metadata.totalDurationSeconds = Math.round((Date.now() - startMs) / 1000);
                metadata.cleanupScheduled = false;

                const costBreakdown = calculateConferenceCost(metadata);
                if (costBreakdown.totalCost > 0) {
                  await trackCallCost(callLog.id, costBreakdown.totalCost, costBreakdown.currency);
                  metadata.conferenceCostBreakdown = costBreakdown;
                }

                try {
                  await callLogsService.updateCallLog(callLog.companyId, callLog.id, { metadata });
                } catch (_) {}

                if (callLog.status !== 'completed' && callLog.status !== 'failed') {
                  await callLogsService.updateCallLogStatus(callLog.id, 'completed');
                  if (callLog.companyId !== null) {
                    CallLogsEventEmitter.emitCallCompleted(
                      callLog.id,
                      callLog.companyId,
                      { conferenceName: FriendlyName, conferenceSid: ConferenceSid }
                    );
                  }
                }
              }
            } catch (err) {
              console.error('[Conference Webhook] Error updating call log on conference end:', err);
            }
            break;

          case 'participant-join':
            console.log(`[Conference Webhook] Participant joined: ${CallSid} to ${FriendlyName}, Label: ${ParticipantLabel}`);
            // A participant (customer or agent) joined the conference
            for (const callLog of callLogs) {
              if (callLog.companyId !== null) {
                CallLogsEventEmitter.emitConferenceParticipantJoined(
                  callLog.id,
                  callLog.companyId,
                  {
                    participantLabel: ParticipantLabel,
                    conferenceSid: ConferenceSid,
                    timestamp: new Date()
                  }
                );
                
                // Track participant join times in metadata for debugging
                const metadata = callLog.metadata || {};
                if (!metadata.participantJoinTimes) {
                  metadata.participantJoinTimes = {};
                }
                metadata.participantJoinTimes[ParticipantLabel || 'unknown'] = new Date().toISOString();
                
                // Track participant labels
                if (!metadata.participantLabels) {
                  metadata.participantLabels = [];
                }
                if (ParticipantLabel && !metadata.participantLabels.includes(ParticipantLabel)) {
                  metadata.participantLabels.push(ParticipantLabel);
                }
                metadata.maxParticipants = Math.max(metadata.maxParticipants || 0, (metadata.participantLabels || []).length);

                // Persist metadata update to database
                try {
                  await callLogsService.updateCallLog(callLog.companyId, callLog.id, {
                    metadata: metadata
                  });
                  console.log(`[Conference Webhook] Participant join logged for call ${callLog.id}, label: ${ParticipantLabel}`);
                } catch (err) {
                  console.error(`[Conference Webhook] Error updating metadata for call ${callLog.id}:`, err);
                }
                
                // Detect audio issues: if customer joins but agent doesn't join within 10 seconds
                if (ParticipantLabel === 'customer') {
                  const callLogId = callLog.id;
                  const companyId = callLog.companyId;
                  const timeoutKey = String(callLogId);
                  
                  // Clear any existing timeout for this call (module-scope map persists across webhook calls)
                  const existingTimeout = agentJoinTimeoutHandles.get(timeoutKey);
                  if (existingTimeout) {
                    clearTimeout(existingTimeout);
                    agentJoinTimeoutHandles.delete(timeoutKey);
                  }
                  
                  // Set timeout to check if agent joined
                  const timeoutHandle = setTimeout(async () => {
                    try {
                      const updatedCallLog = await callLogsService.getCallLogById(companyId, callLogId);
                      const participantLabels = updatedCallLog?.metadata?.participantLabels || [];
                      
                      if (!participantLabels.includes('agent')) {
                        console.warn(`[Conference Webhook] Agent did not join within 10 seconds for call ${callLogId}`);
                        CallLogsEventEmitter.emitCallError(callLogId, companyId, {
                          type: 'agent_join_timeout',
                          details: 'Agent did not join conference within 10 seconds of customer joining'
                        });
                      }
                      
                      agentJoinTimeoutHandles.delete(timeoutKey);
                    } catch (error) {
                      console.error('[Conference Webhook] Error checking agent join:', error);
                      agentJoinTimeoutHandles.delete(timeoutKey);
                    }
                  }, 10000);
                  
                  agentJoinTimeoutHandles.set(timeoutKey, timeoutHandle);
                } else if (ParticipantLabel === 'agent') {
                  // Agent joined - clear and delete timeout entry so we do not emit agent_join_timeout
                  const timeoutKey = String(callLog.id);
                  const existingTimeout = agentJoinTimeoutHandles.get(timeoutKey);
                  if (existingTimeout) {
                    clearTimeout(existingTimeout);
                    agentJoinTimeoutHandles.delete(timeoutKey);
                    console.log(`[Conference Webhook] Agent joined - cleared timeout check for call ${callLog.id}`);
                  }
                }
              }
            }
            break;

          case 'participant-leave':
            console.log(`[Conference Webhook] Participant left: ${CallSid} from ${FriendlyName}, Label: ${ParticipantLabel}`);
            for (const callLog of callLogs) {
              if (callLog.companyId !== null) {
                CallLogsEventEmitter.emitConferenceParticipantLeft(
                  callLog.id,
                  callLog.companyId,
                  {
                    participantLabel: ParticipantLabel,
                    conferenceSid: ConferenceSid,
                    timestamp: new Date()
                  }
                );
                const metadata = callLog.metadata || {};
                if (!metadata.participantLeaveTimes) metadata.participantLeaveTimes = {};
                metadata.participantLeaveTimes[ParticipantLabel || 'unknown'] = new Date().toISOString();
                try {
                  await callLogsService.updateCallLog(callLog.companyId, callLog.id, { metadata });
                } catch (_) {}
                console.log(`[Conference Webhook] Participant leave logged for call ${callLog.id}, label: ${ParticipantLabel}`);
              }
            }
            break;

          case 'participant-mute':
            console.log(`[Conference Webhook] Participant muted: ${CallSid}, Muted: ${Muted}`);
            break;

          case 'participant-hold':
            console.log(`[Conference Webhook] Participant hold: ${CallSid}, Hold: ${Hold}`);
            break;

          default:
            console.log(`[Conference Webhook] Unhandled event: ${StatusCallbackEvent}`);
        }

        // Always respond with 200 OK to acknowledge receipt
        res.sendStatus(200);

      } catch (error) {
        console.error('[Conference Webhook] Error processing webhook:', error);
        res.sendStatus(500);
      }
    }
  );

  /**
   * Cleanup Stale Calls Endpoint
   * Manually trigger cleanup of stale calls
   */
  app.post('/api/call-agent/cleanup/stale', ensureSuperAdmin, async (req, res) => {
    try {
      const { cleanupStaleCalls } = await import('./services/call-agent-service');
      const result = cleanupStaleCalls();
      
      res.json({
        success: true,
        data: {
          cleaned: result.cleaned,
          errors: result.errors.length,
          details: result.errors
        }
      });
    } catch (error) {
      console.error('[CallAgent] Error cleaning up stale calls:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to cleanup stale calls'
      });
    }
  });

  /**
   * Force Cleanup All Calls Endpoint
   * Emergency endpoint to force cleanup of all active calls
   */
  app.post('/api/call-agent/cleanup/force', ensureSuperAdmin, async (req, res) => {
    try {
      const { forceCleanupAllCalls } = await import('./services/call-agent-service');
      const result = forceCleanupAllCalls();
      
      logger.warn('call-agent', 'Force cleanup triggered via API');
      
      res.json({
        success: true,
        data: {
          cleaned: result.cleaned,
          errors: result.errors.length,
          details: result.errors
        }
      });
    } catch (error) {
      console.error('[CallAgent] Error force cleaning up calls:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to force cleanup'
      });
    }
  });

  /**
   * Conference Cleanup Endpoint
   * POST /api/call-agent/conferences/cleanup
   * Optional body: { conferenceSid?: string } for targeted cleanup
   */
  app.post('/api/call-agent/conferences/cleanup', ensureSuperAdmin, async (req, res) => {
    try {
      const conferenceSid = (req.body && (req.body as any).conferenceSid) || (req.query.conferenceSid as string) || undefined;
      const result = await conferenceCleanupScheduler.runStaleCleanup(conferenceSid);
      res.json({
        success: true,
        data: {
          totalConferences: result.totalConferences,
          cleanedConferences: result.cleanedConferences,
          activeConferences: result.activeConferences,
          errors: result.errors,
          details: result.details
        }
      });
    } catch (error) {
      console.error('[CallAgent] Conference cleanup error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to cleanup conferences'
      });
    }
  });

  /**
   * List Active Conferences
   * GET /api/call-agent/conferences/active
   */
  app.get('/api/call-agent/conferences/active', ensureSuperAdmin, async (req, res) => {
    try {
      const metrics = await conferenceCleanupScheduler.getConferenceMetrics();
      const activeConferences = await conferenceCleanupScheduler.getActiveConferences();
      res.json({
        success: true,
        data: {
          activeCount: metrics.activeCount,
          conferences: activeConferences,
          longestRunning: metrics.longestRunning
        }
      });
    } catch (error) {
      console.error('[CallAgent] Error listing active conferences:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list active conferences'
      });
    }
  });

  /**
   * Conference Statistics
   * GET /api/call-agent/conferences/stats
   */
  app.get('/api/call-agent/conferences/stats', ensureSuperAdmin, async (req, res) => {
    try {
      const metrics = await conferenceCleanupScheduler.getConferenceMetrics();
      const status = conferenceCleanupScheduler.getStatus();
      res.json({
        success: true,
        data: {
          ...metrics,
          schedulerRunning: status.isRunning,
          scheduledCleanupsCount: status.scheduledCleanupsCount
        }
      });
    } catch (error) {
      console.error('[CallAgent] Error fetching conference stats:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch conference stats'
      });
    }
  });

  /**
   * Terminate Specific Conference
   * POST /api/call-agent/conferences/:conferenceSid/terminate
   */
  app.post('/api/call-agent/conferences/:conferenceSid/terminate', ensureSuperAdmin, async (req, res) => {
    try {
      const conferenceSid = req.params.conferenceSid;
      if (!conferenceSid) {
        return res.status(400).json({ success: false, error: 'conferenceSid required' });
      }
      const result = await conferenceCleanupScheduler.runStaleCleanup(conferenceSid);
      res.json({
        success: true,
        data: {
          conferenceSid,
          terminated: result.cleanedConferences > 0,
          errors: result.errors
        }
      });
    } catch (error) {
      console.error('[CallAgent] Error terminating conference:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to terminate conference'
      });
    }
  });

  /**
   * Recover Circuit Breaker Endpoint
   * Manually recover from circuit breaker state
   */
  app.post('/api/call-agent/recover/circuit-breaker', ensureSuperAdmin, async (req, res) => {
    try {
      const { attemptCircuitBreakerRecovery } = await import('./services/call-agent-service');
      const result = attemptCircuitBreakerRecovery();
      
      if (result.success) {
        logger.info('call-agent', 'Circuit breaker recovery triggered via API');
      }
      
      res.json({
        success: result.success,
        message: result.message
      });
    } catch (error) {
      console.error('[CallAgent] Error recovering circuit breaker:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to recover circuit breaker'
      });
    }
  });

}
