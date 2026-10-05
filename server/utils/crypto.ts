import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-cbc';

/**
 * Derive the 32-byte AES key used for at-rest encryption (TikTok envelopes, SMTP password, etc.).
 * Requires `ENCRYPTION_KEY`: either 64 hex digits (32 bytes) or a UTF-8 string of at least 32 characters
 * (only the first 32 bytes are used, matching prior truncation behavior for long keys).
 */
export function assertEncryptionKeyConfigured(): void {
  getEncryptionKey();
}

function getEncryptionKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error(
      'ENCRYPTION_KEY is required. Use a strong secret: 64 hex characters (32 bytes) or a UTF-8 string of at least 32 characters.'
    );
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  if (raw.length < 32) {
    throw new Error(
      'ENCRYPTION_KEY must be either 64 hex digits or a UTF-8 string of at least 32 characters.'
    );
  }
  return Buffer.from(raw.slice(0, 32), 'utf8');
}

/**
 * Decrypt an encrypted value (e.g., password or secret key)
 * @param encryptedValue - The encrypted value in format "ivHex:encryptedHex"
 * @returns The decrypted plain text value
 */
export function decryptValue(encryptedValue: string): string {
  const [ivHex, encrypted] = encryptedValue.split(':');
  if (!ivHex || encrypted == null) {
    throw new Error('Invalid encrypted payload format (expected iv:ciphertext)');
  }
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Encrypt a plain text value (e.g., password or secret key)
 * @param plainText - The plain text value to encrypt
 * @returns The encrypted value in format "ivHex:encryptedHex"
 */
export function encryptValue(plainText: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}
