import crypto from 'crypto';
import { db } from '../db';
import { metaOnboardingSessions } from '../../shared/schema';
import { eq, lt } from 'drizzle-orm';
import { encryptValue, decryptValue } from '../utils/crypto';

export type MetaOnboardingChannel = 'instagram' | 'messenger' | 'whatsapp';

const ONBOARDING_SESSION_TTL_MS = 15 * 60 * 1000;

export async function cleanupExpiredMetaOnboardingSessions(): Promise<void> {
  await db
    .delete(metaOnboardingSessions)
    .where(lt(metaOnboardingSessions.expiresAt, new Date()));
}

export async function createMetaOnboardingSession(
  userAccessToken: string,
  userId: number,
  companyId: number,
  channel: MetaOnboardingChannel,
  discoveredAssetIds: string[]
): Promise<string> {
  await cleanupExpiredMetaOnboardingSessions();

  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + ONBOARDING_SESSION_TTL_MS);

  await db.insert(metaOnboardingSessions).values({
    sessionId,
    userId,
    companyId,
    channel,
    encryptedUserAccessToken: encryptValue(userAccessToken),
    discoveredAssetIds,
    expiresAt,
  });

  return sessionId;
}

export async function consumeMetaOnboardingSession(
  sessionId: string,
  userId: number,
  companyId: number,
  channel: MetaOnboardingChannel,
  assetId?: string
): Promise<string | null> {
  await cleanupExpiredMetaOnboardingSessions();

  const [session] = await db
    .select()
    .from(metaOnboardingSessions)
    .where(eq(metaOnboardingSessions.sessionId, sessionId))
    .limit(1);

  if (!session) {
    return null;
  }
  if (session.userId !== userId || session.companyId !== companyId) {
    return null;
  }
  if (session.channel !== channel) {
    return null;
  }
  if (new Date() > session.expiresAt) {
    await db.delete(metaOnboardingSessions).where(eq(metaOnboardingSessions.sessionId, sessionId));
    return null;
  }

  const assetIds = Array.isArray(session.discoveredAssetIds) ? session.discoveredAssetIds : [];
  if (assetId && !assetIds.includes(assetId)) {
    return null;
  }

  await db.delete(metaOnboardingSessions).where(eq(metaOnboardingSessions.sessionId, sessionId));

  try {
    return decryptValue(session.encryptedUserAccessToken);
  } catch {
    return null;
  }
}
