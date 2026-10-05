import crypto from 'node:crypto';
import { FACTUS_SECRET_MASK, type FactusSettingsInput } from '../../../../shared/factus';

function encryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY || (process.env.NODE_ENV !== 'production' ? process.env.SESSION_SECRET || 'development-factus-key' : undefined);
  if (!secret) throw new Error('ENCRYPTION_KEY is required for Factus credentials');
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptFactusSecret(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${ciphertext.toString('base64')}`;
}

export function decryptFactusSecret(value: string): string {
  const [version, iv, tag, ciphertext] = value.split(':');
  if (version !== 'v1' || !iv || !tag || !ciphertext) throw new Error('Invalid encrypted Factus credential');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
}

export function resolveFactusSecrets(incoming: FactusSettingsInput, current?: FactusSettingsInput): FactusSettingsInput {
  return {
    ...incoming,
    password: incoming.password === FACTUS_SECRET_MASK ? current?.password || '' : incoming.password,
    clientSecret: incoming.clientSecret === FACTUS_SECRET_MASK ? current?.clientSecret || '' : incoming.clientSecret,
  };
}
