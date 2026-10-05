import type { NormalizedMetaReferral } from './meta-referral-normalization';

/** Pending ad attribution expires if the customer does not message within this window. */
export const PENDING_META_REFERRAL_TTL_MS = 15 * 60 * 1000;

interface PendingMetaReferralEntry {
  referral: NormalizedMetaReferral;
  createdAt: number;
}

const pendingStore = new Map<string, PendingMetaReferralEntry>();

function isPendingMetaReferralExpired(entry: PendingMetaReferralEntry, now = Date.now()): boolean {
  return now - entry.createdAt > PENDING_META_REFERRAL_TTL_MS;
}

function getFreshPendingMetaReferralEntry(key: string, now = Date.now()): PendingMetaReferralEntry | null {
  const entry = pendingStore.get(key);
  if (!entry) {
    return null;
  }
  if (isPendingMetaReferralExpired(entry, now)) {
    pendingStore.delete(key);
    return null;
  }
  return entry;
}

export function buildPendingMetaReferralKey(params: {
  companyId: number;
  channelType: string;
  connectionId: number;
  senderId: string;
}): string {
  return `${params.companyId}:${params.channelType}:${params.connectionId}:${params.senderId}`;
}

export function storePendingMetaReferral(key: string, referral: NormalizedMetaReferral): void {
  pendingStore.set(key, { referral, createdAt: Date.now() });
}

export function consumePendingMetaReferral(key: string): NormalizedMetaReferral | null {
  const entry = getFreshPendingMetaReferralEntry(key);
  if (!entry) {
    return null;
  }
  pendingStore.delete(key);
  return entry.referral;
}

export function peekPendingMetaReferral(key: string): NormalizedMetaReferral | null {
  const entry = getFreshPendingMetaReferralEntry(key);
  return entry?.referral ?? null;
}

/** Test-only helper to reset in-memory pending referral state between tests. */
export function clearPendingMetaReferralStore(): void {
  pendingStore.clear();
}
