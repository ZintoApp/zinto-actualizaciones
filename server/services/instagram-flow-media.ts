import axios from 'axios';
import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import mime from 'mime-types';
import { resolveStoredMedia, publicMediaUrlForPath } from './conversation-media-files';
import { assertConversationFileSize } from './conversation-upload-policy';
import { prepareInstagramAudio } from '../utils/instagram-audio';
import { isPrivateOrReservedIP } from '../utils/is-private-or-reserved-ip';

type InstagramMediaType = 'image' | 'video' | 'audio' | 'file';
const formats: Record<InstagramMediaType, string[]> = {
  image: ['image/png', 'image/jpeg', 'image/gif'],
  video: ['video/mp4', 'video/ogg', 'video/avi', 'video/x-msvideo', 'video/quicktime', 'video/webm'],
  audio: ['audio/aac', 'audio/x-aac', 'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/wav', 'audio/wave',
    'audio/x-wav', 'audio/webm', 'audio/ogg', 'audio/opus', 'audio/mpeg', 'audio/mp3', 'video/webm'],
  file: ['application/pdf'],
};

// Remote flow assets also use attachment upload. Pin public DNS and bound every download.
async function downloadAsset(value: string, maxBytes: number) {
  let url = new URL(value);
  for (let redirects = 0; redirects < 4; redirects++) {
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new Error('Instagram media requires an HTTP(S) URL without embedded credentials.');
    }
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = await lookup(host, { all: true });
    if (!addresses.length || addresses.some(item => isPrivateOrReservedIP(item.address))) {
      throw new Error('Instagram media file was not found locally and its URL is not public.');
    }
    const pinnedLookup = (hostname: string, options: any, callback: any) => {
      if (hostname.replace(/^\[|\]$/g, '') !== host) return callback(new Error('Unexpected media hostname'));
      if (options.all) return callback(null, addresses);
      const address = addresses.find(item => !options.family || item.family === options.family) || addresses[0];
      callback(null, address.address, address.family);
    };
    const response = await axios.get(url.href, {
      responseType: 'arraybuffer', timeout: 60_000, maxRedirects: 0,
      maxContentLength: maxBytes, proxy: false,
      httpAgent: new http.Agent({ lookup: pinnedLookup }), httpsAgent: new https.Agent({ lookup: pinnedLookup }),
      validateStatus: status => status === 200 || [301, 302, 303, 307, 308].includes(status),
    });
    if (response.status !== 200) {
      if (!response.headers.location) throw new Error('Instagram media redirect has no destination.');
      url = new URL(response.headers.location, url);
      continue;
    }
    const contentType = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const mimeType = contentType && contentType !== 'application/octet-stream'
      ? contentType : mime.lookup(url.pathname) || '';
    const bytes = Buffer.from(response.data);
    if (!bytes.length || bytes.length > maxBytes) throw new Error('Instagram media is empty or exceeds the attachment size limit.');
    return { bytes, mimeType };
  }
  throw new Error('Too many Instagram media redirects.');
}

/** Match Inbox delivery: validate, convert audio to AAC, then upload a local attachment. */
export async function prepareInstagramFlowMedia(mediaUrl: string, type: string, companyId: number | null) {
  const mediaType = (type === 'document' ? 'file' : type === 'voice' ? 'audio' : type) as InstagramMediaType;
  if (!Object.hasOwn(formats, mediaType)) throw new Error(`Instagram does not support ${type} media type`);
  const limitType = mediaType === 'file' ? 'document' : mediaType;
  const maxBytes = (mediaType === 'image' ? 8 : 25) * 1024 * 1024;
  const generated: string[] = [];
  const cleanup = async (keepDelivered: boolean) => {
    if (!keepDelivered) await Promise.all(generated.map(file => unlink(file).catch(() => {})));
  };
  try {
    let localFilePath = await resolveStoredMedia(mediaUrl);
    let mimeType = localFilePath ? mime.lookup(localFilePath) || '' : '';
    const directory = path.resolve('uploads/instagram-flow-media');
    if (!localFilePath) {
      const downloaded = await downloadAsset(mediaUrl, maxBytes);
      mimeType = downloaded.mimeType;
      if (!formats[mediaType].includes(mimeType)) throw new Error(`Unsupported Instagram ${limitType} format: ${mimeType || 'unknown'}`);
      await mkdir(directory, { recursive: true });
      localFilePath = path.join(directory, `${randomUUID()}.${mime.extension(mimeType) || 'bin'}`);
      generated.push(localFilePath);
      await writeFile(localFilePath, downloaded.bytes, { flag: 'wx' });
    }
    if (!formats[mediaType].includes(mimeType)) throw new Error(`Unsupported Instagram ${limitType} format: ${mimeType || 'unknown'}`);
    if (!(await stat(localFilePath)).size) throw new Error('Instagram media file is empty.');
    await assertConversationFileSize(companyId, 'instagram', localFilePath, limitType);
    if (mediaType === 'audio') {
      const prepared = await prepareInstagramAudio(localFilePath, directory);
      generated.push(prepared.outputPath);
      localFilePath = prepared.outputPath;
      await assertConversationFileSize(companyId, 'instagram', localFilePath, limitType);
    }
    // Only the delivered asset must remain available for Inbox playback.
    for (const file of generated.filter(file => file !== localFilePath)) await unlink(file).catch(() => {});
    return { mediaType, localFilePath, mediaUrl: publicMediaUrlForPath(localFilePath) || mediaUrl, cleanup };
  } catch (error) {
    await cleanup(false);
    throw error;
  }
}
