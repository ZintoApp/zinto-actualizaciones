import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { instagramEnglish, type InstagramTranslate } from '../../shared/instagram-i18n';

const run = promisify(execFile);
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export async function prepareInstagramAudio(inputPath: string, outputDirectory: string, t: InstagramTranslate = instagramEnglish) {
  const input = await stat(inputPath);
  if (!input.size || input.size > MAX_AUDIO_BYTES) {
    throw new Error(t("instagram.errors.audio_size", 'Instagram audio must be non-empty and no larger than 25MB.'));
  }
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = path.join(outputDirectory, `instagram-audio-${randomUUID()}.m4a`);
  try {
    // Browser WebM/Opus recordings need AAC in an MP4 container for Instagram.
    await run(ffmpegInstaller.path, [
      '-hide_banner', '-loglevel', 'error', '-nostdin', '-n',
      '-protocol_whitelist', 'file,pipe', '-i', path.resolve(inputPath),
      '-map', '0:a:0', '-vn', '-c:a', 'aac', '-profile:a', 'aac_low',
      '-b:a', '64k', '-ar', '44100', '-ac', '1', '-map_metadata', '-1',
      '-movflags', '+faststart', '-f', 'mp4', outputPath,
    ], { windowsHide: true, timeout: 120000, maxBuffer: 1024 * 1024 });
    const output = await stat(outputPath);
    if (!output.size || output.size > MAX_AUDIO_BYTES) {
      throw new Error(t("instagram.errors.converted_audio_size", 'The converted Instagram audio exceeds the 25MB limit. Record a shorter message.'));
    }
    return { outputPath, mimeType: 'audio/mp4', size: output.size };
  } catch {
    await unlink(outputPath).catch(() => {});
    throw new Error(t("instagram.errors.prepare_audio", 'Could not prepare audio for Instagram. Try recording again or upload an AAC, M4A or WAV audio file.'));
  }
}
