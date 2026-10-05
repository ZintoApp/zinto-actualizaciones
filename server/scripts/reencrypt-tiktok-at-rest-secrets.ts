/**
 * One-time operational migration: re-wrap TikTok `ttk1:` secrets with the current ENCRYPTION_KEY.
 *
 * Use when rotating ENCRYPTION_KEY or after removing the insecure default key from older deployments.
 *
 * 1. Set ENCRYPTION_KEY in the environment to the **new** key (64 hex or 32+ UTF-8 chars).
 * 2. Set LEGACY_ENCRYPTION_KEY to the **previous** key used to encrypt existing rows, **or**
 *    set USE_TIKTOK_LEGACY_DEFAULT_INSECURE_KEY=1 once to decrypt data that was encrypted with the
 *    old built-in default (development-only historical artifact).
 * 3. Run: npx tsx server/scripts/reencrypt-tiktok-at-rest-secrets.ts
 *
 * Requires DATABASE_URL and a working server .env (same as production).
 */

import 'dotenv/config';
import { createDecipheriv } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { channelConnections, partnerConfigurations } from '../../shared/schema';
import type { TikTokConnectionData } from '@shared/types/tiktok';
import {
  encryptTikTokSecretForStorage,
  isTikTokSecretEnvelope,
} from '../utils/tiktok-secret-storage';

const ALGORITHM = 'aes-256-cbc';
const LEGACY_INSECURE_DEFAULT = 'default-key-change-in-production-32';

/** Match historical `crypto.ts` derivation for a given env string (including short keys padded with zeros). */
function keyBufferFromMaterial(material: string): Buffer {
  const t = material.trim();
  if (/^[0-9a-fA-F]{64}$/.test(t)) return Buffer.from(t, 'hex');
  if (t.length >= 32) return Buffer.from(t.slice(0, 32), 'utf8');
  return Buffer.from(t.padEnd(32, '0').slice(0, 32), 'utf8');
}

function assertModernEncryptionKey(): void {
  const raw = process.env.ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error('ENCRYPTION_KEY is required');
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return;
  if (raw.length < 32) throw new Error('ENCRYPTION_KEY must be 64 hex chars or UTF-8 length >= 32');
}

function decryptAesCbcPayload(ivAndCipherHex: string, key: Buffer): string {
  const [ivHex, encrypted] = ivAndCipherHex.split(':');
  if (!ivHex || encrypted == null) throw new Error('invalid iv:ciphertext');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  let out = decipher.update(encrypted, 'hex', 'utf8');
  out += decipher.final('utf8');
  return out;
}

function decryptEnvelopeWithKey(envelope: string, keyMaterial: string): string {
  if (!isTikTokSecretEnvelope(envelope)) return envelope;
  const inner = envelope.slice('ttk1:'.length);
  return decryptAesCbcPayload(inner, keyBufferFromMaterial(keyMaterial));
}

function migrateSecret(stored: string | null | undefined, legacyMaterial: string): string | null | undefined {
  if (stored == null || stored === '') return stored;
  if (!isTikTokSecretEnvelope(stored)) return encryptTikTokSecretForStorage(stored) ?? stored;
  const plain = decryptEnvelopeWithKey(stored, legacyMaterial);
  return encryptTikTokSecretForStorage(plain) ?? stored;
}

async function main(): Promise<void> {
  assertModernEncryptionKey();

  let legacyMaterial = process.env.LEGACY_ENCRYPTION_KEY?.trim();
  if (!legacyMaterial && process.env.USE_TIKTOK_LEGACY_DEFAULT_INSECURE_KEY === '1') {
    legacyMaterial = LEGACY_INSECURE_DEFAULT;
    console.warn('[migration] Using insecure historical default key for decrypt only — remove USE_TIKTOK_LEGACY_DEFAULT_INSECURE_KEY after this run.');
  }
  if (!legacyMaterial) {
    throw new Error('Set LEGACY_ENCRYPTION_KEY (previous key) or USE_TIKTOK_LEGACY_DEFAULT_INSECURE_KEY=1 for legacy data.');
  }

  const tiktokChannels = await db
    .select()
    .from(channelConnections)
    .where(eq(channelConnections.channelType, 'tiktok'));

  let channelUpdates = 0;
  for (const row of tiktokChannels) {
    const nextAccess = migrateSecret(row.accessToken ?? undefined, legacyMaterial);
    const raw = row.connectionData as TikTokConnectionData | null | undefined;
    let nextData = raw;
    if (raw && typeof raw === 'object') {
      const d = { ...raw };
      if (d.accessToken != null) d.accessToken = migrateSecret(String(d.accessToken), legacyMaterial) ?? '';
      if (d.refreshToken != null) d.refreshToken = migrateSecret(String(d.refreshToken), legacyMaterial) ?? '';
      nextData = d;
    }
    if (
      nextAccess !== row.accessToken ||
      JSON.stringify(nextData) !== JSON.stringify(row.connectionData)
    ) {
      await db
        .update(channelConnections)
        .set({ accessToken: nextAccess ?? null, connectionData: nextData as unknown })
        .where(eq(channelConnections.id, row.id));
      channelUpdates++;
    }
  }

  const tiktokPartners = await db
    .select()
    .from(partnerConfigurations)
    .where(eq(partnerConfigurations.provider, 'tiktok'));

  let partnerUpdates = 0;
  for (const row of tiktokPartners) {
    const nextSecret = migrateSecret(row.partnerSecret ?? undefined, legacyMaterial);
    const nextToken = migrateSecret(row.accessToken ?? undefined, legacyMaterial);
    const nextWh = migrateSecret(row.webhookVerifyToken ?? undefined, legacyMaterial);
    if (
      nextSecret !== row.partnerSecret ||
      nextToken !== row.accessToken ||
      nextWh !== row.webhookVerifyToken
    ) {
      await db
        .update(partnerConfigurations)
        .set({
          partnerSecret: nextSecret ?? '',
          accessToken: nextToken ?? null,
          webhookVerifyToken: nextWh ?? null,
        })
        .where(eq(partnerConfigurations.id, row.id));
      partnerUpdates++;
    }
  }

  console.log(
    `[migration] Done. Updated ${channelUpdates} TikTok channel row(s), ${partnerUpdates} TikTok partner row(s).`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
