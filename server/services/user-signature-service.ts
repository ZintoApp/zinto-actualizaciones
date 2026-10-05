import sharp from 'sharp';
import { randomUUID, createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { userSignatures } from '../../shared/schema';
import { SIGNATURE_MAX_BYTES, SIGNATURE_MAX_DIMENSION, signatureSettingsSchema, signatureCropPixels, enhanceSignaturePixels, type SignatureSettings } from '../../shared/user-signature';

export class SignatureError extends Error { constructor(public code: 'invalid' | 'blank' | 'tooLarge') { super(code); } }
export async function processSignature(original: Buffer, rawSettings: unknown) {
  const settings = signatureSettingsSchema.parse(rawSettings);
  if (!original.length || original.length > SIGNATURE_MAX_BYTES) throw new SignatureError('tooLarge');
  try {
    const metadata = await sharp(original, { limitInputPixels: 25_000_000, pages: 1 }).metadata();
    if (!['jpeg', 'png', 'webp', 'gif'].includes(metadata.format || '')) throw new SignatureError('invalid');
    const normalized = await sharp(original, { limitInputPixels: 25_000_000, pages: 1 }).rotate()
      .resize(SIGNATURE_MAX_DIMENSION, SIGNATURE_MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
    const rotated = await sharp(normalized).rotate(settings.rotation).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const crop = signatureCropPixels(settings.crop, rotated.info.width, rotated.info.height);
    const pixels = await sharp(rotated.data, { raw: rotated.info }).extract(crop).ensureAlpha().raw().toBuffer();
    enhanceSignaturePixels(pixels, settings);
    let ink = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] > 32 && Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) < 240) ink++;
    if (ink < Math.max(5, crop.width * crop.height * 0.0001)) throw new SignatureError('blank');
    const content = await sharp(pixels, { raw: { width: crop.width, height: crop.height, channels: 4 } }).png().toBuffer();
    return { content, settings, originalMime: `image/${metadata.format === 'jpeg' ? 'jpeg' : metadata.format}` };
  } catch (error) { if (error instanceof SignatureError) throw error; throw new SignatureError('invalid'); }
}
export async function saveUserSignature(userId: number, companyId: number | null, original: Buffer, settings: SignatureSettings) {
  const processed = await processSignature(original, settings);
  const row = { userId, companyId, original, ...processed, revision: randomUUID(), contentHash: createHash('sha256').update(processed.content).digest('hex'), updatedAt: new Date() };
  return (await db.insert(userSignatures).values(row).onConflictDoUpdate({ target: userSignatures.userId, set: row }).returning())[0];
}
export async function getUserSignature(userId: number) { return (await db.select().from(userSignatures).where(eq(userSignatures.userId, userId)))[0]; }
export async function getClinicSignature(companyId: number, userId: number) { return (await db.select().from(userSignatures).where(and(eq(userSignatures.userId, userId), eq(userSignatures.companyId, companyId))))[0]; }
export async function listClinicSignatures(companyId: number) {
  return db.select({ userId: userSignatures.userId, revision: userSignatures.revision, hash: userSignatures.contentHash }).from(userSignatures).where(eq(userSignatures.companyId, companyId));
}
export async function deleteUserSignature(userId: number) { await db.delete(userSignatures).where(eq(userSignatures.userId, userId)); }
