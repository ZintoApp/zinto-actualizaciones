import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { z } from 'zod';
import { APPSUMO_ORIGIN } from '../../shared/appsumo';

export const appSumoEventSchema = z.object({
  license_key: z.string().uuid(),
  prev_license_key: z.string().uuid().optional(),
  event: z.enum(['purchase', 'activate', 'upgrade', 'downgrade', 'deactivate']),
  license_status: z.enum(['inactive', 'active', 'deactivated']).optional(),
  tier: z.number().int().positive().optional(),
  event_timestamp: z.number().finite(),
  created_at: z.number().finite().optional(),
  test: z.boolean().optional(),
  extra: z.object({ reason: z.string().optional() }).passthrough().optional(),
  parent_license_key: z.string().optional(),
}).passthrough();
export type AppSumoEvent = z.infer<typeof appSumoEventSchema>;

export function verifyAppSumoSignature(body: Buffer, timestamp: string, signature: string, key: string, now = Date.now()): boolean {
  if (!/^\d{13}$/.test(timestamp) || !/^[a-fA-F0-9]{64}$/.test(signature) || Math.abs(now - Number(timestamp)) > 300_000) return false;
  const expected = createHmac('sha256', key).update(timestamp).update(body).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

// Use the application's existing Express proxy configuration, as the public
// WhatsApp integration does. req.secure resolves HTTPS through that configuration.
export function isCanonicalAppSumoRequest(req: Pick<Request, 'headers' | 'secure'>): boolean {
  if (req.headers.host !== 'app.talkzen.io') return false;
  if (req.headers['x-forwarded-host'] && req.headers['x-forwarded-host'] !== 'app.talkzen.io') return false;
  if (req.headers['x-forwarded-port'] && req.headers['x-forwarded-port'] !== '443') return false;
  if (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-proto'] !== 'https') return false;
  return req.secure === true;
}

export function requireAppSumoBrowser(req: Request): void {
  if (!isCanonicalAppSumoRequest(req) || req.headers.origin !== APPSUMO_ORIGIN || (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin')) {
    throw new Error('AppSumo activation is available only at https://app.talkzen.io');
  }
}

export function safeAppSumoManagementUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.origin === 'https://appsumo.com' && !url.username && !url.password && url.pathname.startsWith('/licensing/') ? url.href : null;
  } catch { return null; }
}
