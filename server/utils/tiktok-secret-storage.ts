/**
 * TikTok secrets at rest (`ttk1:` + AES). Requires `ENCRYPTION_KEY` (see `server/utils/crypto.ts`).
 * To rotate keys or fix data encrypted with a former default key, run:
 * `npx tsx server/scripts/reencrypt-tiktok-at-rest-secrets.ts` (see script header).
 */
import type { ChannelConnection, PartnerConfiguration } from '@shared/schema';
import { encryptValue, decryptValue } from './crypto';
import type { TikTokConnectionData } from '@shared/types/tiktok';

const TIKTOK_SECRET_PREFIX = 'ttk1:';

export function isTikTokSecretEnvelope(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(TIKTOK_SECRET_PREFIX);
}

/** Encrypt a plaintext TikTok secret for DB storage (idempotent if already wrapped). */
export function encryptTikTokSecretForStorage(plain: string | null | undefined): string | null {
  if (plain == null || plain === '') return plain ?? null;
  if (isTikTokSecretEnvelope(plain)) return plain;
  return `${TIKTOK_SECRET_PREFIX}${encryptValue(plain)}`;
}

/** Decrypt a stored TikTok secret; returns legacy plaintext unchanged. */
export function decryptTikTokSecretFromStorage(stored: string | null | undefined): string {
  if (stored == null || stored === '') return '';
  if (!isTikTokSecretEnvelope(stored)) return stored;
  return decryptValue(stored.slice(TIKTOK_SECRET_PREFIX.length));
}

export function tiktokSecretNeedsEncryption(value: string | null | undefined): boolean {
  if (value == null || value === '') return false;
  return !isTikTokSecretEnvelope(value);
}

function cloneConnectionData(data: TikTokConnectionData): TikTokConnectionData {
  return { ...data };
}

/** Encrypt sensitive fields on TikTok connection payload before insert/update. */
export function encryptTikTokChannelConnectionForWrite(
  connection: Pick<ChannelConnection, 'channelType' | 'accessToken' | 'connectionData'>
): { accessToken: string | null | undefined; connectionData: unknown } {
  if (connection.channelType !== 'tiktok') {
    return {
      accessToken: connection.accessToken ?? undefined,
      connectionData: connection.connectionData,
    };
  }
  const raw = connection.connectionData as TikTokConnectionData | null | undefined;
  const encAccess = encryptTikTokSecretForStorage(connection.accessToken ?? undefined);
  if (!raw || typeof raw !== 'object') {
    return { accessToken: encAccess ?? connection.accessToken, connectionData: connection.connectionData };
  }
  const next = cloneConnectionData(raw);
  next.accessToken = encryptTikTokSecretForStorage(next.accessToken ?? '') ?? '';
  next.refreshToken = encryptTikTokSecretForStorage(next.refreshToken ?? '') ?? '';
  return {
    accessToken: encAccess ?? null,
    connectionData: next,
  };
}

/** Encrypt TikTok row fields on partner_configuration insert/update. */
export function encryptTikTokPartnerConfigurationForWrite(
  data: Partial<PartnerConfiguration> & { provider?: string }
): Partial<PartnerConfiguration> {
  if (data.provider !== undefined && data.provider !== 'tiktok') return data;
  const out = { ...data };
  if (out.partnerSecret != null) {
    out.partnerSecret = encryptTikTokSecretForStorage(String(out.partnerSecret)) ?? '';
  }
  if (out.accessToken != null) {
    out.accessToken = encryptTikTokSecretForStorage(String(out.accessToken)) ?? '';
  }
  if (out.webhookVerifyToken != null) {
    out.webhookVerifyToken = encryptTikTokSecretForStorage(String(out.webhookVerifyToken)) ?? '';
  }
  return out;
}

export function getDecryptedTikTokConnectionSecrets(connection: ChannelConnection): {
  accessToken: string | undefined;
  connectionData: TikTokConnectionData | undefined;
  needsMigration: boolean;
} {
  if (connection.channelType !== 'tiktok') {
    return {
      accessToken: connection.accessToken ?? undefined,
      connectionData: connection.connectionData as TikTokConnectionData | undefined,
      needsMigration: false,
    };
  }
  const row = connection.accessToken;
  const raw = connection.connectionData as TikTokConnectionData | undefined;
  let needsMigration = false;
  if (row != null && tiktokSecretNeedsEncryption(row)) needsMigration = true;
  const colAccess = row != null ? decryptTikTokSecretFromStorage(row) : undefined;

  if (!raw || typeof raw !== 'object') {
    return { accessToken: colAccess, connectionData: raw, needsMigration };
  }
  const data = cloneConnectionData(raw);
  if (data.accessToken != null && tiktokSecretNeedsEncryption(data.accessToken)) needsMigration = true;
  if (data.refreshToken != null && tiktokSecretNeedsEncryption(data.refreshToken)) needsMigration = true;
  data.accessToken = decryptTikTokSecretFromStorage(data.accessToken);
  data.refreshToken = decryptTikTokSecretFromStorage(data.refreshToken);

  const resolvedAccess = colAccess ?? (data.accessToken || undefined);
  return {
    accessToken: resolvedAccess,
    connectionData: data,
    needsMigration,
  };
}

export function getDecryptedTikTokPartnerConfigurationSecrets(config: PartnerConfiguration): {
  partnerSecret: string;
  accessToken: string | undefined;
  webhookVerifyToken: string | undefined;
  needsMigration: boolean;
} {
  let needsMigration = false;
  const ps = config.partnerSecret;
  if (ps != null && tiktokSecretNeedsEncryption(ps)) needsMigration = true;
  const at = config.accessToken;
  if (at != null && tiktokSecretNeedsEncryption(at)) needsMigration = true;
  const wh = config.webhookVerifyToken;
  if (wh != null && tiktokSecretNeedsEncryption(wh)) needsMigration = true;

  return {
    partnerSecret: ps != null ? decryptTikTokSecretFromStorage(ps) : '',
    accessToken: at != null ? decryptTikTokSecretFromStorage(at) : undefined,
    webhookVerifyToken: wh != null ? decryptTikTokSecretFromStorage(wh) : undefined,
    needsMigration,
  };
}

/** Decrypt TikTok partner row for super-admin API responses (secrets at rest remain ciphertext in DB). */
export function decryptTikTokPartnerConfigurationForAdminResponse(config: PartnerConfiguration): PartnerConfiguration {
  if (config.provider !== 'tiktok') return config;
  const { partnerSecret, accessToken, webhookVerifyToken } = getDecryptedTikTokPartnerConfigurationSecrets(config);
  return {
    ...config,
    partnerSecret: partnerSecret || config.partnerSecret,
    accessToken: accessToken ?? config.accessToken,
    webhookVerifyToken: webhookVerifyToken ?? config.webhookVerifyToken,
  };
}
