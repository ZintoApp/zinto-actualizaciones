import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { storage } from '../storage';
import { requireMediaConversation } from './conversation-media-access';
import { recordMediaFileOwnership } from './media-ownership';
import { MB, mediaTypeForMime, uploadSizeError, type ConversationUploadLimits } from '../../shared/conversation-media';

export async function getConversationUploadLimits(companyId: number | null | undefined, channelType: string): Promise<ConversationUploadLimits> {
  const company = companyId ? await storage.getCompany(companyId) : null;
  const plan = company?.planId ? await storage.getPlan(company.planId) : null;
  if (!plan) throw Object.assign(new Error('A company with a configured plan is required to upload media.'), { status: 409 });
  const mb = plan.fileUploadLimit ?? 25;
  if (!Number.isFinite(mb) || mb < 0) throw Object.assign(new Error('Invalid plan upload limit'), { status: 409 });
  // Provider limits are separate from the company entitlement.
  const channelMaxBytes: Record<string, number> = channelType === 'whatsapp_official'
    ? { image: 5 * MB, video: 16 * MB, audio: 16 * MB, document: 100 * MB, sticker: 500 * 1024 }
    : ['whatsapp', 'whatsapp_unofficial'].includes(channelType) ? { image: 16 * MB, video: 16 * MB, audio: 16 * MB, document: 2048 * MB, sticker: 500 * 1024 }
    : channelType === 'tiktok' ? { image: 3 * MB, video: 64 * MB }
    : channelType === 'twilio_sms' ? { image: 5 * MB, video: 5 * MB, audio: 5 * MB, document: 5 * MB }
    : channelType === 'instagram' ? { image: 8 * MB, video: 25 * MB, audio: 25 * MB, document: 25 * MB }
    : channelType === 'telegram' ? { image: 10 * MB, video: 50 * MB, audio: 50 * MB, document: 50 * MB }
    : channelType === 'messenger' || channelType === 'facebook' ? { image: 25 * MB, video: 25 * MB, audio: 25 * MB, document: 25 * MB }
    : {};
  return { planMaxBytes: mb === 0 ? null : mb * MB, channelMaxBytes };
}

export async function assertConversationFileSize(companyId: number | null, channelType: string, filePath: string, type: string) {
  const limits = await getConversationUploadLimits(companyId, channelType);
  const stat = await fs.stat(filePath);
  const error = uploadSizeError(limits, type, stat.size);
  if (error) throw Object.assign(new Error(error.message), error, { status: 413 });
}

/** A single multipart parser, authorized before any bytes are saved. */
export function conversationUpload(options: { directory: string; multiple?: boolean; staged?: boolean }) {
  return async (req: any, res: any, next: any) => {
    try {
      const conversationId = Number(req.params.id || req.query.conversationId);
      const conversation = await requireMediaConversation(req.user, conversationId);
      const limits = await getConversationUploadLimits(conversation.companyId, conversation.channelType);
      req.mediaConversation = conversation;
      req.conversationUploadLimits = limits;
      await fs.mkdir(options.directory, { recursive: true });
      const parser = multer({
        storage: multer.diskStorage({
          destination: options.directory,
          filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
        }),
        // Busboy emits LIMIT_FILE_SIZE at the boundary; allow one sentinel byte,
        // then compare the actual size below so exactly-at-limit files succeed.
        limits: { fileSize: limits.planMaxBytes === null ? Infinity : limits.planMaxBytes + 1, files: options.multiple ? 20 : 1, fields: 30, fieldSize: MB },
        fileFilter: (_req, file, cb) => {
          const accepted = options.multiple ? /^attachment_\d+$/.test(file.fieldname) : ['file', 'media'].includes(file.fieldname);
          if (!accepted) return cb(new Error('Unexpected attachment field'));
          cb(null, true);
        },
      }).any();
      parser(req, res, async (error: any) => {
        const files: Express.Multer.File[] = req.files || [];
        const cleanup = () => Promise.all(files.map(file => fs.unlink(file.path).catch(() => {})));
        if (error) {
          await cleanup();
          const sizeError = error.code === 'LIMIT_FILE_SIZE';
          return res.status(sizeError ? 413 : 400).json({ code: sizeError ? 'FILE_TOO_LARGE' : 'INVALID_UPLOAD', source: 'plan', maxBytes: limits.planMaxBytes, message: sizeError ? `Maximum file size is ${(limits.planMaxBytes ?? 0) / MB} MB (plan limit).` : error.message });
        }
        for (const file of files) {
          const sizeError = uploadSizeError(limits, mediaTypeForMime(file.mimetype), file.size);
          if (sizeError) { await cleanup(); return res.status(413).json(sizeError); }
        }
        try {
          if (options.staged) for (const file of files) {
            await recordMediaFileOwnership({ companyId: conversation.companyId!, publicUrl: `/uploads/${path.relative(path.resolve('uploads'), file.path).split(path.sep).join('/')}`, bucket: `conversation:${conversation.id}:staged`, fileSize: file.size });
          }
        } catch (error: any) { await cleanup(); return res.status(500).json({ message: 'Unable to register media upload' }); }
        req.file = files[0];
        // Failed sends must not leave their incoming temporary upload behind.
        res.once('finish', () => { if (res.statusCode >= 400 || options.multiple) void cleanup(); });
        next();
      });
    } catch (error: any) {
      res.status(error.status || 500).json({ message: error.message });
    }
  };
}
