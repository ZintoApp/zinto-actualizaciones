import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { SIGNATURE_MAX_BYTES, signatureSettingsSchema } from '../../shared/user-signature';
import { deleteUserSignature, getUserSignature, saveUserSignature, SignatureError } from '../services/user-signature-service';

const router = Router();
router.use((req, res, next) => { if (!req.user?.id) { res.sendStatus(401); return; } res.setHeader('Cache-Control', 'private, no-store'); next(); });
const metadata = (row: NonNullable<Awaited<ReturnType<typeof getUserSignature>>>) => ({ revision: row.revision, settings: row.settings, updatedAt: row.updatedAt.toISOString(), imageUrl: `/api/users/me/signature/image?v=${row.revision}`, originalUrl: `/api/users/me/signature/original?v=${row.revision}` });
router.get('/', async (req, res, next) => { try { const row = await getUserSignature(req.user!.id); res.json({ success: true, data: row ? metadata(row) : null }); } catch (error) { next(error); } });
for (const original of [true, false]) router.get(original ? '/original' : '/image', async (req, res, next) => {
  try { const row = await getUserSignature(req.user!.id); if (!row) { res.sendStatus(404); return; }
    res.setHeader('Content-Type', original ? row.originalMime : 'image/png'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(Buffer.from(original ? row.original : row.content));
  } catch (error) { next(error); }
});
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: SIGNATURE_MAX_BYTES, files: 1, fields: 1, fieldSize: 4096 } }).single('original');
router.post('/', async (req, res, next) => {
  try {
    await new Promise<void>((resolve, reject) => upload(req, res, error => error ? reject(new SignatureError(error.code === 'LIMIT_FILE_SIZE' ? 'tooLarge' : 'invalid')) : resolve()));
    if (!req.file) throw new SignatureError('invalid');
    let settings; try { settings = signatureSettingsSchema.parse(JSON.parse(req.body.settings)); } catch { throw new SignatureError('invalid'); }
    const row = await saveUserSignature(req.user!.id, req.user!.companyId ?? null, req.file.buffer, settings);
    res.json({ success: true, data: metadata(row) });
  } catch (error) {
    if (error instanceof SignatureError || error instanceof z.ZodError) { res.status(400).json({ errorCode: `profile.signature.errors.${error instanceof SignatureError ? error.code : 'invalid'}` }); return; }
    next(error);
  }
});
router.delete('/', async (req, res, next) => { try { await deleteUserSignature(req.user!.id); res.json({ success: true }); } catch (error) { next(error); } });
export default router;
