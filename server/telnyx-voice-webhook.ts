/**
 * Telnyx Call Control voice webhooks: signature verification (Ed25519 + timestamp)
 * and mapping of call lifecycle events into the shared call log / status-update flow.
 */
import type express from 'express';
import { TelnyxWebhook } from 'telnyx';
import { storage } from './storage';
import { callLogsService } from './services/call-logs-service';
import { CallLogsEventEmitter } from './utils/websocket';
import { callAgentService } from './services/call-agent-service';
import {
  normalizeVoiceChannelConnectionData,
  type NormalizedVoiceChannelConnectionData
} from '@shared/types/call-types';
import { logger } from './utils/logger';

const TELNYX_PUBLIC_KEY_ENV = 'TELNYX_WEBHOOK_PUBLIC_KEY';

function getTelnyxWebhookPublicKey(): string | undefined {
  const k = process.env[TELNYX_PUBLIC_KEY_ENV];
  return typeof k === 'string' && k.trim() ? k.trim() : undefined;
}

function uniquePublicKeys(keys: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of keys) {
    const t = k.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function buildFlatHeaders(req: express.Request): Record<string, string> {
  const flatHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (v === undefined) continue;
    flatHeaders[k] = Array.isArray(v) ? v[0] : v;
  }
  return flatHeaders;
}

async function resolveTelnyxWebhookVerificationPublicKeys(
  fromNum: string,
  toNum: string
): Promise<string[]> {
  const matched = await findTelnyxVoiceConnectionsByNumbers(fromNum, toNum);
  const fromConnections = matched
    .map((d) => d.telnyxWebhookVerificationKey?.trim())
    .filter((k): k is string => !!k);
  const envKey = getTelnyxWebhookPublicKey();
  return uniquePublicKeys([...fromConnections, ...(envKey ? [envKey] : [])]);
}

async function verifyTelnyxWebhookWithCandidateKeys(
  rawStr: string,
  flatHeaders: Record<string, string>,
  candidatePublicKeys: string[]
): Promise<boolean> {
  for (const publicKey of candidatePublicKeys) {
    try {
      const verifier = new TelnyxWebhook(publicKey);
      await verifier.verify(rawStr, flatHeaders);
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

function mapTelnyxHangupCauseToCallStatus(cause?: string): string {
  switch (cause) {
    case 'normal_clearing':
    case 'time_limit':
      return 'completed';
    case 'user_busy':
      return 'busy';
    case 'no_answer':
    case 'timeout':
      return 'no-answer';
    case 'originator_cancel':
      return 'canceled';
    case 'call_rejected':
    case 'not_found':
      return 'failed';
    default:
      return 'completed';
  }
}

function mapTelnyxEventToCallStatus(
  eventType: string | undefined,
  payload: Record<string, unknown>
): { callStatus: string; durationSec?: number; isTerminal: boolean; isFailure: boolean } | null {
  if (!eventType) return null;
  switch (eventType) {
    case 'call.initiated':
      return { callStatus: 'initiated', isTerminal: false, isFailure: false };
    case 'call.answered':
    case 'call.bridged':
      return { callStatus: 'in-progress', isTerminal: false, isFailure: false };
    case 'call.hangup': {
      const hangupCause = payload.hangup_cause as string | undefined;
      const callStatus = mapTelnyxHangupCauseToCallStatus(hangupCause);
      const durationRaw = payload.call_duration_secs ?? payload.duration_sec;
      let durationSec: number | undefined;
      if (typeof durationRaw === 'number' && durationRaw >= 0) durationSec = Math.floor(durationRaw);
      const terminalStates = ['completed', 'failed', 'busy', 'no-answer', 'canceled'];
      const isTerminal = terminalStates.includes(callStatus);
      const isFailure = ['failed', 'busy', 'no-answer', 'canceled'].includes(callStatus);
      return { callStatus, durationSec, isTerminal, isFailure };
    }
    default:
      return null;
  }
}

async function findTelnyxVoiceConnectionsByNumbers(
  from?: string,
  to?: string
): Promise<NormalizedVoiceChannelConnectionData[]> {
  if (!from && !to) return [];
  try {
    const voiceConnections = await storage.getChannelConnectionsByType('twilio_voice');
    const matches: NormalizedVoiceChannelConnectionData[] = [];
    for (const conn of voiceConnections) {
      const connData = normalizeVoiceChannelConnectionData(conn.connectionData as Record<string, unknown> | null);
      if (connData.providerStack !== 'telnyx-vapi') continue;
      const connFrom = connData.fromNumber?.trim();
      if (!connFrom) continue;
      if (connFrom === from || connFrom === to) {
        matches.push(connData);
      }
    }
    return matches;
  } catch (e) {
    console.warn('[TelnyxVoice] findTelnyxVoiceConnectionsByNumbers failed:', e);
    return [];
  }
}

async function resolveTelnyxCompanyIdFromNumbers(from?: string, to?: string): Promise<number> {
  if (!from && !to) return 0;
  try {
    const voiceConnections = await storage.getChannelConnectionsByType('twilio_voice');
    for (const conn of voiceConnections) {
      const connData = normalizeVoiceChannelConnectionData(conn.connectionData as Record<string, unknown> | null);
      if (connData.providerStack !== 'telnyx-vapi') continue;
      const connFrom = connData.fromNumber?.trim();
      if (!connFrom) continue;
      if (connFrom === from || connFrom === to) {
        const id = Number(conn.companyId);
        return Number.isInteger(id) && id > 0 ? id : 0;
      }
    }
  } catch (e) {
    console.warn('[TelnyxVoice] resolveTelnyxCompanyIdFromNumbers failed:', e);
  }
  return 0;
}

export async function handleTelnyxVoiceWebhook(req: express.Request, res: express.Response): Promise<void> {
  const startTime = Date.now();
  try {
    const rawStr = Buffer.isBuffer(req.body)
      ? req.body.toString('utf8')
      : typeof req.body === 'string'
        ? req.body
        : '';

    const flatHeaders = buildFlatHeaders(req);
    const signature = (req.headers['telnyx-signature-ed25519'] || req.headers['Telnyx-Signature-Ed25519']) as string | undefined;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawStr || '{}') as Record<string, unknown>;
    } catch {
      res.status(400).json({ error: 'Invalid JSON' });
      return;
    }

    const data = (parsed.data as Record<string, unknown> | undefined) ?? parsed;
    const payload = (data.payload as Record<string, unknown>) ?? {};
    const fromNum = typeof payload.from === 'string' ? payload.from : '';
    const toNum = typeof payload.to === 'string' ? payload.to : '';

    const candidateKeys = await resolveTelnyxWebhookVerificationPublicKeys(fromNum, toNum);

    if (candidateKeys.length > 0) {
      const ok = await verifyTelnyxWebhookWithCandidateKeys(rawStr, flatHeaders, candidateKeys);
      if (!ok) {
        console.error('[TelnyxVoice] Webhook signature verification failed (no matching public key)');
        logger.error('telnyx-voice', 'Webhook signature verification failed');
        res.status(403).json({ error: 'Invalid signature' });
        return;
      }
    } else if (process.env.NODE_ENV === 'production') {
      console.error(
        '[TelnyxVoice] No Telnyx webhook verification key: set telnyxWebhookVerificationKey on the matching voice connection and/or TELNYX_WEBHOOK_PUBLIC_KEY'
      );
      res.status(503).json({ error: 'Webhook verification not configured' });
      return;
    } else if (signature) {
      console.warn(
        '[TelnyxVoice] Skipping signature verification (no per-connection key or TELNYX_WEBHOOK_PUBLIC_KEY in non-production)'
      );
    }

    const eventType = data.event_type as string | undefined;
    const callControlId = typeof payload.call_control_id === 'string' ? payload.call_control_id : undefined;

    if (!callControlId) {
      res.status(200).json({ received: true });
      return;
    }

    const mapped = mapTelnyxEventToCallStatus(eventType, payload);
    if (!mapped) {
      res.status(200).json({ received: true });
      return;
    }

    const { callStatus, durationSec, isTerminal, isFailure } = mapped;

    const occurredAt =
      typeof data.occurred_at === 'string' ? new Date(data.occurred_at) : new Date();

    const { call: upsertedCall } = await callLogsService.upsertCallLog({
      twilioCallSid: callControlId,
      status: callStatus,
      durationSec,
      endedAt: isTerminal ? new Date() : undefined,
      startedAt: callStatus === 'in-progress' ? occurredAt : undefined
    });

    const existingCall = upsertedCall;
    const callData = callAgentService.getActiveCall(callControlId);

    let resolvedCompanyId: number = Number(existingCall?.companyId) || 0;
    if (resolvedCompanyId === 0 && existingCall) {
      try {
        if (existingCall.channelId) {
          const channelConnection = await storage.getChannelConnection(existingCall.channelId);
          const candidate = Number(channelConnection?.companyId);
          if (Number.isInteger(candidate) && candidate > 0) resolvedCompanyId = candidate;
        }
        if (resolvedCompanyId === 0 && existingCall.contactId) {
          const contact = await storage.getContact(existingCall.contactId);
          const candidate = Number(contact?.companyId);
          if (Number.isInteger(candidate) && candidate > 0) resolvedCompanyId = candidate;
        }
        if (resolvedCompanyId === 0 && existingCall.conversationId) {
          const conversation = await storage.getConversation(existingCall.conversationId);
          const candidate = Number(conversation?.companyId);
          if (Number.isInteger(candidate) && candidate > 0) resolvedCompanyId = candidate;
        }
        if (resolvedCompanyId === 0 && callData?.config) {
          const candidate = Number((callData.config as { companyId?: number }).companyId);
          if (Number.isInteger(candidate) && candidate > 0) resolvedCompanyId = candidate;
        }
        if (resolvedCompanyId === 0 && (fromNum || toNum)) {
          const cid = await resolveTelnyxCompanyIdFromNumbers(fromNum, toNum);
          if (cid > 0) resolvedCompanyId = cid;
        }
        if (resolvedCompanyId > 0 && resolvedCompanyId !== (existingCall.companyId ?? undefined)) {
          await callLogsService.upsertCallLog({ twilioCallSid: callControlId, companyId: resolvedCompanyId });
        }
      } catch (err) {
        console.warn(`[TelnyxVoice] Error resolving companyId for call ${callControlId}:`, err);
      }
    }

    if (existingCall && Number.isInteger(resolvedCompanyId) && resolvedCompanyId > 0) {
      CallLogsEventEmitter.emitCallStatusUpdate(existingCall.id, resolvedCompanyId, callStatus, {
        callSid: callControlId,
        startedAt: existingCall.startedAt ?? undefined,
        durationSec
      });
    }

    if (existingCall && isTerminal) {
      if (Number.isInteger(resolvedCompanyId) && resolvedCompanyId > 0) {
        if (isFailure) {
          const failureReason = `Telnyx hangup: ${(payload.hangup_cause as string) || callStatus}`;
          CallLogsEventEmitter.emitCallFailed(existingCall.id, resolvedCompanyId, failureReason);
        } else {
          CallLogsEventEmitter.emitCallCompleted(existingCall.id, resolvedCompanyId, {
            status: callStatus,
            duration: durationSec ?? 0
          });
        }
      }
      if (callData) {
        callAgentService.removeActiveCall(callControlId);
      }
    }

    res.status(200).json({ received: true });
    const processingTime = Date.now() - startTime;
    if (processingTime > 1000) {
      console.warn(`[TelnyxVoice] Slow webhook: ${processingTime}ms for ${callControlId}`);
    }
  } catch (error: unknown) {
    console.error('[TelnyxVoice] Error processing webhook:', error);
    logger.error('telnyx-voice', 'Webhook processing error');
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
