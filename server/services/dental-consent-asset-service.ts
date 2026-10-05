import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { dentalConsentAssets } from '../../shared/schema';
import { consentAssetIds } from '../../shared/dental-consent-rich-text';

export const CONSENT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export class ConsentAssetError extends Error {
  constructor(public readonly code: 'imageInvalid' | 'imageUnavailable') { super(code); }
}
export async function normalizeConsentImage(bytes: Buffer) {
  if (!bytes.length || bytes.length > CONSENT_IMAGE_MAX_BYTES) throw new ConsentAssetError('imageInvalid');
  try {
    const source = sharp(bytes, { animated: false, limitInputPixels: 20000000, failOn: 'error' });
    const metadata = await source.metadata();
    if (!['jpeg', 'png', 'webp', 'gif'].includes(metadata.format || '')) throw new Error('Unsupported image');
    const { data, info } = await source.rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
    if (data.length > CONSENT_IMAGE_MAX_BYTES) throw new Error('Image too large');
    return { content: data, width: info.width, height: info.height, fileSize: data.length, mimeType: 'image/png' };
  } catch { throw new ConsentAssetError('imageInvalid'); }
}
export async function createConsentAsset(companyId: number, file: { buffer: Buffer; originalname: string }, userId: number | null) {
  const normalized = await normalizeConsentImage(file.buffer);
  const id = randomUUID();
  await db.insert(dentalConsentAssets).values({ id, companyId, originalName: file.originalname.slice(0, 255), createdBy: userId, ...normalized });
  return { id, url: `/api/erp/dental/consent-assets/${id}`, width: normalized.width, height: normalized.height, size: normalized.fileSize, mimetype: normalized.mimeType };
}
export async function getConsentAsset(companyId: number, id: string) {
  const [asset] = await db.select().from(dentalConsentAssets).where(and(eq(dentalConsentAssets.companyId, companyId), eq(dentalConsentAssets.id, id)));
  return asset;
}
export async function loadConsentBodyImages(companyId: number, html: string) {
  const images: Record<string, { content: Buffer; width: number; height: number }> = {};
  for (const id of consentAssetIds(html)) {
    const asset = await getConsentAsset(companyId, id);
    if (!asset) throw new ConsentAssetError('imageUnavailable');
    images[id] = { content: Buffer.from(asset.content), width: asset.width, height: asset.height };
  }
  return images;
}
