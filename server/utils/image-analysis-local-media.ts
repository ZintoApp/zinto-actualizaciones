import * as fs from 'fs/promises';
import * as path from 'path';
import mime from 'mime-types';
import { isPlaceholderMediaUrl } from './image-analysis-media';

type ResolvedImage = {
  sourceMediaUrl: string;
  localPath?: string;
  buffer?: Buffer;
  mimeType?: string;
};

const ALLOWED_LOCAL_MEDIA_ROOTS = [
  path.resolve(process.cwd(), 'public', 'media'),
  path.resolve(process.cwd(), 'uploads')
];

function isHttpUrl(mediaUrl: string): boolean {
  return /^https?:\/\//i.test(mediaUrl);
}

function isWithinAllowedMediaRoots(candidatePath: string): boolean {
  const normalizedPath = path.resolve(candidatePath);
  return ALLOWED_LOCAL_MEDIA_ROOTS.some(root => {
    const relative = path.relative(root, normalizedPath);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  });
}

export function resolveLocalMediaPath(mediaUrl: string): string | null {
  if (!mediaUrl || isPlaceholderMediaUrl(mediaUrl)) return null;
  let resolvedPath: string | null = null;
  if (mediaUrl.startsWith('/media/')) resolvedPath = path.join(process.cwd(), 'public', mediaUrl.slice(1));
  else if (mediaUrl.startsWith('media/')) resolvedPath = path.join(process.cwd(), 'public', mediaUrl);
  else if (mediaUrl.startsWith('/uploads/')) resolvedPath = path.join(process.cwd(), mediaUrl.slice(1));
  else if (mediaUrl.startsWith('uploads/')) resolvedPath = path.join(process.cwd(), mediaUrl);
  else if (path.isAbsolute(mediaUrl)) resolvedPath = mediaUrl;
  if (!resolvedPath) return null;
  if (!isWithinAllowedMediaRoots(resolvedPath)) return null;
  return path.resolve(resolvedPath);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function localImageFromMediaUrl(mediaUrl: string | null | undefined): Promise<ResolvedImage | null> {
  if (!mediaUrl || isHttpUrl(mediaUrl)) return null;
  const localPath = resolveLocalMediaPath(mediaUrl);
  if (!localPath || !isWithinAllowedMediaRoots(localPath)) return null;
  if (!(await fileExists(localPath))) return null;
  const mimeType = mime.lookup(localPath) || undefined;
  if (mimeType === 'image/svg+xml') return null;
  return { sourceMediaUrl: mediaUrl, localPath, mimeType: mimeType || undefined };
}
