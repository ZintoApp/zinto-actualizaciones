import path from 'node:path';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import crypto from 'node:crypto';
import sharp from 'sharp';
import mime from 'mime-types';

const roots = [path.resolve('uploads'), path.resolve('public/media'), path.resolve('public/uploads'), path.resolve('public/email-attachments')];
export function containedMediaPath(root: string, candidate: string) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}
export function publicMediaUrlForPath(file: string): string | null {
  const locations = [['uploads', '/uploads/'], ['public/media', '/media/'], ['public/uploads', '/uploads/'], ['public/email-attachments', '/email-attachments/']];
  for (const [directory, prefix] of locations) {
    const root = path.resolve(directory);
    if (containedMediaPath(root, file)) return `${prefix}${path.relative(root, file).split(path.sep).join('/')}`;
  }
  return null;
}
export async function resolveStoredMedia(value: string | null | undefined): Promise<string | null> {
  if (!value || /\/media\/placeholder-/.test(value)) return null;
  let pathname = value;
  if (/^https?:/i.test(value)) {
    try { pathname = new URL(value).pathname; } catch { return null; }
  }
  try { pathname = decodeURIComponent(pathname.split('?')[0].split('#')[0]); } catch { return null; }
  const candidates = pathname.startsWith('/uploads/')
    ? [path.resolve('uploads', pathname.slice(9)), path.resolve('public/uploads', pathname.slice(9))]
    : pathname.startsWith('/media/flow-media/') ? [path.resolve('uploads/flow-media', pathname.slice(18)), path.resolve('public/media', pathname.slice(7))]
    : pathname.startsWith('/media/') ? [path.resolve('public/media', pathname.slice(7))]
    : pathname.startsWith('/email-attachments/') ? [path.resolve('uploads/email-attachments', pathname.slice(19)), path.resolve('public/email-attachments', pathname.slice(19))]
    : [path.resolve(pathname)];
  for (const candidate of candidates) {
    if (!roots.some(root => containedMediaPath(root, candidate))) continue;
    try {
      const real = await fs.realpath(candidate);
      if (roots.some(root => containedMediaPath(root, real)) && (await fs.stat(real)).isFile()) return real;
    } catch { /* Try the next historical storage location. */ }
  }
  return null;
}
export function downloadFilename(metadata: any, fallback: string) {
  try { if (typeof metadata === 'string') metadata = JSON.parse(metadata); } catch { metadata = {}; }
  const original = metadata?.filename || metadata?.fileName || metadata?.originalFilename;
  return path.basename(String(original || fallback)).replace(/[\r\n\x00-\x1f]/g, '_').slice(0, 200) || 'attachment';
}
const pendingThumbnails = new Map<string, Promise<void>>();
export async function sendStoredMedia(req: any, res: any, file: string, filename: string, track: (bytes: number) => Promise<unknown>) {
  let servingPath = file;
  let stat = await fs.stat(file);
  let contentType = mime.lookup(file) || 'application/octet-stream';
  if (req.query.thumbnail === '1') {
    if (!String(contentType).startsWith('image/') || contentType === 'image/svg+xml') return res.status(404).json({ message: 'Thumbnail unavailable' });
    const key = crypto.createHash('sha256').update(`${file}:${stat.size}:${stat.mtimeMs}`).digest('hex');
    const directory = path.resolve('tmp/conversation-thumbnails');
    servingPath = path.join(directory, `${key}.webp`);
    try { await fs.access(servingPath); } catch {
      let pending = pendingThumbnails.get(key);
      if (!pending) {
        pending = (async () => {
          await fs.mkdir(directory, { recursive: true });
          const temp = `${servingPath}.${crypto.randomUUID()}.tmp`;
          try {
            await sharp(file, { limitInputPixels: 40_000_000 }).rotate().resize(320, 240, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toFile(temp);
            await fs.rename(temp, servingPath);
          } finally { await fs.unlink(temp).catch(() => {}); }
        })().finally(() => pendingThumbnails.delete(key));
        pendingThumbnails.set(key, pending);
      }
      await pending;
    }
    contentType = 'image/webp';
    stat = await fs.stat(servingPath);
  }
  const inline = req.query.inline === '1' || req.query.thumbnail === '1';
  // HTML/SVG and unknown files are always attachments, never active same-origin content.
  const safeInline = inline && /^(image\/(jpeg|png|gif|webp)|video\/|audio\/|application\/pdf)/.test(String(contentType));
  res.setHeader('Content-Type', contentType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `${safeInline ? 'inline' : 'attachment'}; filename="${filename.replace(/[^\x20-\x7e]|["\\]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename).replace(/'/g, '%27')}`);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('Accept-Ranges', 'bytes');
  let start = 0, end = stat.size - 1;
  if (req.headers.range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (!match || (!match[1] && !match[2])) return res.status(416).end();
    start = match[1] ? Number(match[1]) : Math.max(0, stat.size - Number(match[2]));
    end = match[1] && match[2] ? Math.min(Number(match[2]), end) : end;
    if (start > end || start >= stat.size) { res.setHeader('Content-Range', `bytes */${stat.size}`); return res.status(416).end(); }
    res.status(206).setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
  }
  res.setHeader('Content-Length', Math.max(0, end - start + 1));
  if (req.method === 'HEAD' || stat.size === 0) return res.end();
  const stream = createReadStream(servingPath, { start, end });
  let bytes = 0;
  stream.on('data', chunk => { bytes += chunk.length; });
  res.once('close', () => { stream.destroy(); if (bytes) void track(bytes).catch(() => {}); });
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}
