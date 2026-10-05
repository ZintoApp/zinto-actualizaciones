import path from 'node:path';
import { stat, unlink } from 'node:fs/promises';
import mime from 'mime-types';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { mediaFileOwnership } from '../../shared/schema';
import { resolveStoredMedia, publicMediaUrlForPath } from './conversation-media-files';
import { assertConversationFileSize } from './conversation-upload-policy';
import { recordMediaFileOwnership } from './media-ownership';
import { toFullPublicMediaUrl } from './public-media-url';

export async function validateScheduledMedia(data: { companyId: number; conversationId: number; channelType: string; mediaFilePath?: string; mediaUrl?: string; mediaType?: string }, requireOwnership: boolean) {
  const file = await resolveStoredMedia(data.mediaFilePath || data.mediaUrl);
  if (!file) throw new Error('Scheduled media is no longer available. Upload the attachment again.');
  const publicUrl = publicMediaUrlForPath(file)!;
  const [owner] = await db.select().from(mediaFileOwnership).where(eq(mediaFileOwnership.publicUrl, publicUrl)).limit(1);
  if ((requireOwnership && !owner) || (owner && (owner.companyId !== data.companyId || (requireOwnership && owner.bucket !== `conversation:${data.conversationId}:staged`)))) {
    throw new Error('The attachment does not belong to this conversation.');
  }
  await assertConversationFileSize(data.companyId, data.channelType, file, data.mediaType || 'document');
  return file;
}

export async function prepareScheduledMedia(data: any) {
  let file = await validateScheduledMedia(data, false);
  const inputMime = String(mime.lookup(file) || data.metadata?.mimeType || data.metadata?.fileType || 'application/octet-stream');
  let outputMime = inputMime;
  let converted: string | undefined;
  if (data.mediaType === 'audio') {
    const directory = path.resolve('uploads/scheduled-media');
    if (data.channelType === 'instagram') {
      const { prepareInstagramAudio } = await import('../utils/instagram-audio');
      const result = await prepareInstagramAudio(file, directory);
      converted = result.outputPath; outputMime = result.mimeType;
    } else if (['whatsapp', 'whatsapp_unofficial', 'whatsapp_official'].includes(data.channelType) && !['audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg', 'audio/opus'].includes(inputMime)) {
      const { convertAudioForWhatsAppWithFallback } = await import('../utils/audio-converter');
      const result = await convertAudioForWhatsAppWithFallback(file, directory, data.metadata?.fileName || path.basename(file));
      converted = result.outputPath; outputMime = result.mimeType;
    }
  }
  if (converted) {
    try {
      await assertConversationFileSize(data.companyId, data.channelType, converted, data.mediaType);
      const url = `/uploads/${path.relative(path.resolve('uploads'), converted).split(path.sep).join('/')}`;
      await recordMediaFileOwnership({ companyId: data.companyId, publicUrl: url, bucket: `conversation:${data.conversationId}:staged`, fileSize: (await stat(converted)).size });
      file = converted;
    } catch (error) { await unlink(converted).catch(() => {}); throw error; }
  }
  const mediaUrl = toFullPublicMediaUrl(publicMediaUrlForPath(file)!);
  const original = data.metadata?.fileName || path.basename(file);
  return { mediaFilePath: file, mediaUrl, metadata: { ...data.metadata, mimeType: outputMime, fileSize: (await stat(file)).size,
    fileName: converted ? `${path.parse(original).name}${path.extname(file)}` : original } };
}
