import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { mkdir, unlink } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import mime from 'mime-types';
import { isPrivateOrReservedIP } from '../utils/is-private-or-reserved-ip';

const providerHosts: Record<string, string[]> = {
  instagram: ['cdninstagram.com', 'fbcdn.net', 'fbsbx.com'],
  messenger: ['fbcdn.net', 'fbsbx.com'],
  facebook: ['fbcdn.net', 'fbsbx.com'],
  twilio_sms: ['twilio.com', 'twiliocdn.com'],
  tiktok: ['tiktokcdn.com', 'tiktokcdn-us.com', 'tiktokcdn-eu.com', 'byteoversea.com', 'ibytedtos.com', 'muscdn.com', 'tiktok.com'],
};
export function allowedConversationMediaHost(value: string, channel: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443') &&
      (providerHosts[channel] || []).some(host => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch { return false; }
}
/** Download provider media to disk with pinned public DNS and no unbounded memory buffer. */
const pending = new Map<string, Promise<string>>();
export function cacheConversationRemoteMedia(value: string, channel: string, messageId: number, credentials?: { accountSid?: string; authToken?: string }): Promise<string> {
  const key = `${channel}:${messageId}:${value}`;
  const existing = pending.get(key);
  if (existing) return existing;
  const result = downloadRemoteMedia(value, channel, messageId, credentials).finally(() => pending.delete(key));
  pending.set(key, result);
  return result;
}
async function downloadRemoteMedia(value: string, channel: string, messageId: number, credentials?: { accountSid?: string; authToken?: string }): Promise<string> {
  let current = value;
  for (let redirect = 0; redirect < 4; redirect++) {
    if (!allowedConversationMediaHost(current, channel)) throw new Error('Media provider URL is not supported');
    const url = new URL(current);
    const addresses = await lookup(url.hostname, { all: true });
    if (!addresses.length || addresses.some(item => isPrivateOrReservedIP(item.address))) throw new Error('Media provider address is not allowed');
    const headers: Record<string, string> = {};
    if (channel === 'twilio_sms' && url.hostname === 'api.twilio.com') {
      if (!credentials?.accountSid || !credentials.authToken || !url.pathname.startsWith(`/2010-04-01/Accounts/${credentials.accountSid}/`)) throw new Error('Media account does not match the channel');
      headers.Authorization = `Basic ${Buffer.from(`${credentials.accountSid}:${credentials.authToken}`).toString('base64')}`;
    }
    const response = await new Promise<import('node:http').IncomingMessage>((resolve, reject) => {
      const request = https.get(url, { headers, lookup: (hostname, options: any, callback: any) => {
        if (hostname !== url.hostname) return callback(new Error('Unexpected media hostname'));
        if (options.all) return callback(null, addresses);
        const address = addresses.find(item => !options.family || item.family === options.family) || addresses[0];
        callback(null, address.address, address.family);
      } }, resolve);
      request.setTimeout(60_000, () => request.destroy(new Error('Media provider timed out')));
      request.on('error', reject);
    });
    if ([301, 302, 303, 307, 308].includes(response.statusCode || 0) && response.headers.location) {
      current = new URL(response.headers.location, current).href;
      response.destroy();
      continue;
    }
    if (response.statusCode !== 200) { response.destroy(); throw Object.assign(new Error('Media is no longer available from the provider'), { status: 404 }); }
    const extension = mime.extension(String(response.headers['content-type'] || '').split(';')[0]) || 'bin';
    const directory = path.resolve('uploads/conversation-media');
    await mkdir(directory, { recursive: true });
    const filename = `${messageId}-${crypto.randomUUID()}.${extension}`;
    const filePath = path.join(directory, filename);
    try { await pipeline(response, createWriteStream(filePath, { flags: 'wx' })); }
    catch (error) { await unlink(filePath).catch(() => {}); throw error; }
    return `/uploads/conversation-media/${filename}`;
  }
  throw new Error('Too many media provider redirects');
}
