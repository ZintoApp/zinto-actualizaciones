import { createHash, createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import type { ConsentPreviewFields } from '../../shared/dental-consent';

const localSecret = randomBytes(32).toString('hex');
function secret() {
  if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) throw new Error('Consent proof signing is not configured');
  return process.env.SESSION_SECRET || localSecret;
}
export function consentHash(value: Buffer | string): string { return createHash('sha256').update(value).digest('hex'); }
export function signConsentPayload(value: object): string {
  const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${payload}.${createHmac('sha256', secret()).update(`dental-consent:${payload}`).digest('base64url')}`;
}
export function readConsentPayload(token: string): any {
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra || token.length > 16000) throw new Error('previewStale');
  const expected = createHmac('sha256', secret()).update(`dental-consent:${payload}`).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error('previewStale');
  const value = JSON.parse(Buffer.from(payload, 'base64url').toString());
  if (!Number.isFinite(value.expires) || value.expires <= Date.now()) throw new Error('previewStale');
  return value;
}
export type ConsentProof = { purpose: 'preview'; companyId: number; contactId: number; userId: number; fields: ConsentPreviewFields; fingerprint: string; pdfHash: string; expires: number };
export function createConsentProof(input: Omit<ConsentProof, 'purpose' | 'expires' | 'pdfHash'>, pdf: Buffer) {
  return signConsentPayload({ ...input, purpose: 'preview', pdfHash: consentHash(pdf), expires: Date.now() + 60 * 60 * 1000 });
}
export function verifyConsentProof(token: string, companyId: number, contactId: number, userId: number, pdf?: Buffer): ConsentProof {
  const proof = readConsentPayload(token) as ConsentProof;
  if (proof.purpose !== 'preview' || proof.companyId !== companyId || proof.contactId !== contactId || proof.userId !== userId ||
    (pdf && (pdf.length === 0 || proof.pdfHash !== consentHash(pdf)) )) throw new Error('previewStale');
  return proof;
}
