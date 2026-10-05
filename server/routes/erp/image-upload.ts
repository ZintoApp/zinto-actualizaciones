import type { RequestHandler } from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs/promises';
import { dataUsageTracker } from '../../services/data-usage-tracker';
import { recordMediaFileOwnership,deleteMediaFileOwnership } from '../../services/media-ownership';

/** Shared ERP image pipeline; callers enforce their domain permissions. */
export function createErpImageUploadHandler(bucket: string): RequestHandler {
  return createErpFileUploadHandler(bucket, false);
}

/** File/media callers share ownership, usage tracking and storage conventions. */
export function createErpFileUploadHandler(bucket: string, documents = true): RequestHandler {
  const directory = path.join(process.cwd(), bucket);
  const extensions: Record<string, string> = {
    'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp',
  };
  if(documents)Object.assign(extensions,{'application/pdf':'.pdf','application/msword':'.doc','application/vnd.openxmlformats-officedocument.wordprocessingml.document':'.docx','text/plain':'.txt'});
  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, callback) => {
        fs.mkdir(directory, { recursive: true }).then(() => callback(null, directory)).catch(error => callback(error, directory));
      },
      filename: (_req, file, callback) => callback(null, `${crypto.randomBytes(16).toString('hex')}${extensions[file.mimetype]}`),
    }),
    fileFilter: (_req, file, callback) => {
      if (extensions[file.mimetype]) callback(null, true);
      else callback(new Error(documents?'Select an image, PDF, Word or text document':'Only image files are allowed'));
    },
    limits: { fileSize: 10 * 1024 * 1024 },
  });
  return (req, res) => {
    if (!req.user?.companyId) { res.status(403).json({ success: false, error: 'Company required' }); return; }
    upload.single('file')(req, res, async error => {
      if (error) { res.status(400).json({ success: false, error: 'UPLOAD_ERROR', message: error.message }); return; }
      if (!req.file) { res.status(400).json({ success: false, error: 'NO_FILE_PROVIDED', message: 'No file was uploaded' }); return; }
      try {
        const url = `/${bucket}/${req.file.filename}`;
        await recordMediaFileOwnership({ companyId: req.user!.companyId!, publicUrl: url, bucket, fileSize: req.file.size });
        if(res.locals.erpUploadComplete){await res.locals.erpUploadComplete({url,filename:req.file.originalname,size:req.file.size,mimetype:req.file.mimetype});}
        dataUsageTracker.trackFileUpload(req.user!.companyId!, req.file.size).catch(error => console.error('[erp-image-usage]', error));
        res.json({ success: true, data: { url, filename: req.file.originalname, size: req.file.size, mimetype: req.file.mimetype } });
      } catch (error) {
        await deleteMediaFileOwnership(`/${bucket}/${req.file.filename}`).catch(()=>{});
        await fs.unlink(req.file.path).catch(cleanupError => console.error('[erp-image-cleanup]', cleanupError));
        console.error('[erp-image-upload]', error);
        res.status(500).json({ success: false, error: 'PROCESSING_ERROR', message: 'Unable to save image' });
      }
    });
  };
}
