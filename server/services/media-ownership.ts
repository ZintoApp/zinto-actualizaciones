import { db } from '../db';
import { mediaFileOwnership } from '@shared/schema';
import { eq } from 'drizzle-orm';

export function normalizeServedMediaUrlForTracking(value: string): string | null {
  const withoutFragment = value.split('#')[0];
  const withoutQuery = withoutFragment.split('?')[0];

  let pathname = withoutQuery;
  try {
    if (/^https?:\/\//i.test(withoutQuery)) {
      pathname = new URL(withoutQuery).pathname;
    }
  } catch {
    return null;
  }

  if (!pathname.startsWith('/uploads/') && !pathname.startsWith('/media/')) {
    return null;
  }

  return pathname;
}

export async function recordMediaFileOwnership(params: {
  companyId: number;
  publicUrl: string;
  bucket: string;
  fileSize?: number;
}): Promise<void> {
  const publicUrl = normalizeServedMediaUrlForTracking(params.publicUrl);
  if (!publicUrl) {
    return;
  }

  await db
    .insert(mediaFileOwnership)
    .values({
      companyId: params.companyId,
      publicUrl,
      bucket: params.bucket,
      fileSize: params.fileSize
    })
    .onConflictDoUpdate({
      target: mediaFileOwnership.publicUrl,
      set: {
        companyId: params.companyId,
        bucket: params.bucket,
        fileSize: params.fileSize,
        updatedAt: new Date()
      }
    });
}

export async function deleteMediaFileOwnership(publicUrlValue: string): Promise<void> {
  const publicUrl = normalizeServedMediaUrlForTracking(publicUrlValue);
  if (!publicUrl) return;
  await db.delete(mediaFileOwnership).where(eq(mediaFileOwnership.publicUrl, publicUrl));
}
