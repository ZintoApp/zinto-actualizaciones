import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Router, type Request } from 'express';
import multer from 'multer';
import fsExtra from 'fs-extra';
import { PERMISSIONS } from '@shared/schema';
import {
  FLOW_MEDIA_MAX_FILE_SIZE_BYTES,
  FLOW_MEDIA_VARIABLE_NAME_PATTERN,
  collectDeclaredFlowVariableNames,
  isAllowedFlowMediaUpload,
  removeStaleInferredAiMediaVariables,
  type FlowMediaKind,
} from '@shared/types/flow-media';
import { getUserPermissions } from '../middleware';
import { storage } from '../storage';
import { dataUsageTracker } from '../services/data-usage-tracker';
import { deleteMediaFileOwnership, recordMediaFileOwnership } from '../services/media-ownership';
import { userCanAccessFlow } from '../utils/flow-access';

const router = Router({ mergeParams: true });
const uploadDirectory = path.join(process.cwd(), 'uploads', 'flow-media');
fs.mkdirSync(uploadDirectory, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, uploadDirectory),
    filename: (_req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      callback(null, `${Date.now()}-${crypto.randomBytes(16).toString('hex')}${extension}`);
    },
  }),
  limits: { fileSize: FLOW_MEDIA_MAX_FILE_SIZE_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!isAllowedFlowMediaUpload(file.originalname, file.mimetype)) {
      callback(new Error('Unsupported media type. Upload an image, video, audio, PDF, Office, or text document.'));
      return;
    }
    callback(null, true);
  },
});

function mediaKindForMime(mimeType: string): FlowMediaKind {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'document';
}

async function authorizeFlow(req: Request, write: boolean) {
  const flowId = Number(req.params.flowId);
  if (!Number.isInteger(flowId) || flowId <= 0) return { status: 400, error: 'Invalid flow ID' } as const;
  const flow = await storage.getFlow(flowId);
  if (!flow || !userCanAccessFlow(flow, req.user as any)) return { status: 404, error: 'Flow not found' } as const;
  const user = req.user as any;
  const permissions = user.isSuperAdmin ? {} : await getUserPermissions(user);
  const permission = write ? PERMISSIONS.MANAGE_FLOWS : PERMISSIONS.VIEW_FLOWS;
  if (!user.isSuperAdmin && permissions[permission] !== true) return { status: 403, error: 'Flow permission required' } as const;
  if (!flow.companyId) return { status: 400, error: 'Flow must belong to a company' } as const;
  return { flowId, flow, companyId: flow.companyId, user } as const;
}

function validateVariableName(value: unknown): string | null {
  const name = typeof value === 'string' ? value.trim() : '';
  return FLOW_MEDIA_VARIABLE_NAME_PATTERN.test(name) ? name : null;
}

async function inspectVariableAvailability(flow: any, flowId: number, variableName: string, excludeAssetId?: number) {
  const sanitizedNodes = removeStaleInferredAiMediaVariables(flow.nodes, new Set([variableName]));
  const declared = collectDeclaredFlowVariableNames(sanitizedNodes, flow.customVariables);
  if (declared.has(variableName)) {
    return { conflict: 'Variable name conflicts with an existing flow variable.', sanitizedNodes, tookOver: false };
  }
  const assets = await storage.getFlowMediaAssets(flowId);
  if (assets.some((asset) => asset.variableName === variableName && asset.id !== excludeAssetId)) {
    return { conflict: 'Variable name is already used by another media item.', sanitizedNodes, tookOver: false };
  }
  return { conflict: null, sanitizedNodes, tookOver: sanitizedNodes !== flow.nodes };
}

router.get('/', async (req, res) => {
  try {
    const auth = await authorizeFlow(req, false);
    if ('error' in auth) return res.status(auth.status ?? 400).json({ error: auth.error });
    return res.json({ data: await storage.getFlowMediaAssets(auth.flowId) });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load media' });
  }
});

router.post('/', (req, res) => {
  upload.single('file')(req, res, async (uploadError) => {
    if (uploadError) {
      const message = uploadError instanceof multer.MulterError && uploadError.code === 'LIMIT_FILE_SIZE'
        ? 'File too large. Maximum size is 30MB.'
        : uploadError.message || 'Upload failed';
      return res.status(400).json({ error: message });
    }
    let createdAssetId: number | undefined;
    let createdFileUrl: string | undefined;
    try {
      const auth = await authorizeFlow(req, true);
      if ('error' in auth) throw Object.assign(new Error(auth.error), { status: auth.status ?? 400 });
      if (!req.file) throw Object.assign(new Error('No file uploaded'), { status: 400 });
      const variableName = validateVariableName(req.body?.variableName);
      if (!variableName) throw Object.assign(new Error('Variable name must use snake_case and start with a letter.'), { status: 400 });
      const availability = await inspectVariableAvailability(auth.flow, auth.flowId, variableName);
      if (availability.conflict) throw Object.assign(new Error(availability.conflict), { status: 409 });
      const fileUrl = `/media/flow-media/${req.file.filename}`;
      createdFileUrl = fileUrl;
      const asset = await storage.createFlowMediaAsset({
        flowId: auth.flowId,
        companyId: auth.companyId,
        variableName,
        originalName: req.file.originalname,
        fileUrl,
        mimeType: req.file.mimetype,
        mediaKind: mediaKindForMime(req.file.mimetype),
        fileSize: req.file.size,
        uploadedBy: auth.user.id,
      });
      createdAssetId = asset.id;
      await recordMediaFileOwnership({ companyId: auth.companyId, publicUrl: fileUrl, bucket: 'uploads/flow-media', fileSize: req.file.size });
      if (availability.tookOver) {
        await storage.updateFlow(auth.flowId, { nodes: availability.sanitizedNodes as any });
      }
      void dataUsageTracker.trackFileUpload(auth.companyId, req.file.size);
      return res.status(201).json({ data: asset });
    } catch (error: any) {
      if (createdAssetId) await storage.deleteFlowMediaAsset(createdAssetId).catch(() => undefined);
      if (createdFileUrl) await deleteMediaFileOwnership(createdFileUrl).catch(() => undefined);
      if (req.file?.path) await fsExtra.unlink(req.file.path).catch(() => undefined);
      const status = error?.code === '23505' ? 409 : error?.status || 400;
      const message = error?.code === '23505'
        ? 'Variable name is already used by another media item.'
        : error instanceof Error ? error.message : 'Upload failed';
      return res.status(status).json({ error: message });
    }
  });
});

router.patch('/:assetId', async (req, res) => {
  try {
    const auth = await authorizeFlow(req, true);
    if ('error' in auth) return res.status(auth.status ?? 400).json({ error: auth.error });
    const assetId = Number(req.params.assetId);
    if (!Number.isInteger(assetId) || assetId <= 0) return res.status(400).json({ error: 'Invalid media item ID' });
    const asset = await storage.getFlowMediaAsset(assetId);
    if (!asset || asset.flowId !== auth.flowId || asset.companyId !== auth.companyId) return res.status(404).json({ error: 'Media item not found' });
    const variableName = validateVariableName(req.body?.variableName);
    if (!variableName) return res.status(400).json({ error: 'Variable name must use snake_case and start with a letter.' });
    const availability = await inspectVariableAvailability(auth.flow, auth.flowId, variableName, asset.id);
    if (availability.conflict) return res.status(409).json({ error: availability.conflict });
    const updated = await storage.updateFlowMediaAsset(asset.id, { variableName });
    try {
      if (availability.tookOver) {
        await storage.updateFlow(auth.flowId, { nodes: availability.sanitizedNodes as any });
      }
    } catch (error) {
      await storage.updateFlowMediaAsset(asset.id, { variableName: asset.variableName }).catch(() => undefined);
      throw error;
    }
    return res.json({ data: updated });
  } catch (error: any) {
    const status = error?.code === '23505' ? 409 : 500;
    return res.status(status).json({ error: error?.code === '23505' ? 'Variable name is already used by another media item.' : error?.message || 'Rename failed' });
  }
});

router.put('/:assetId/file', (req, res) => {
  upload.single('file')(req, res, async (uploadError) => {
    if (uploadError) {
      const message = uploadError instanceof multer.MulterError && uploadError.code === 'LIMIT_FILE_SIZE'
        ? 'File too large. Maximum size is 30MB.'
        : uploadError.message || 'Upload failed';
      return res.status(400).json({ error: message });
    }
    let newFileUrl: string | undefined;
    let newOwnershipRecorded = false;
    try {
      const auth = await authorizeFlow(req, true);
      if ('error' in auth) throw Object.assign(new Error(auth.error), { status: auth.status ?? 400 });
      const assetId = Number(req.params.assetId);
      if (!Number.isInteger(assetId) || assetId <= 0) throw Object.assign(new Error('Invalid media item ID'), { status: 400 });
      const asset = await storage.getFlowMediaAsset(assetId);
      if (!asset || asset.flowId !== auth.flowId || asset.companyId !== auth.companyId) throw Object.assign(new Error('Media item not found'), { status: 404 });
      if (!req.file) throw Object.assign(new Error('No file uploaded'), { status: 400 });
      const oldPath = path.join(uploadDirectory, path.basename(asset.fileUrl));
      const fileUrl = `/media/flow-media/${req.file.filename}`;
      newFileUrl = fileUrl;
      await recordMediaFileOwnership({ companyId: auth.companyId, publicUrl: fileUrl, bucket: 'uploads/flow-media', fileSize: req.file.size });
      newOwnershipRecorded = true;
      const updated = await storage.updateFlowMediaAsset(asset.id, {
        originalName: req.file.originalname,
        fileUrl,
        mimeType: req.file.mimetype,
        mediaKind: mediaKindForMime(req.file.mimetype),
        fileSize: req.file.size,
        uploadedBy: auth.user.id,
      });
      await fsExtra.unlink(oldPath).catch(() => undefined);
      await deleteMediaFileOwnership(asset.fileUrl).catch(() => undefined);
      void dataUsageTracker.trackFileDelete(auth.companyId, asset.fileSize);
      void dataUsageTracker.trackFileUpload(auth.companyId, req.file.size);
      return res.json({ data: updated });
    } catch (error: any) {
      if (newOwnershipRecorded && newFileUrl) await deleteMediaFileOwnership(newFileUrl).catch(() => undefined);
      if (req.file?.path) await fsExtra.unlink(req.file.path).catch(() => undefined);
      return res.status(error?.status || 400).json({ error: error instanceof Error ? error.message : 'Replacement failed' });
    }
  });
});

router.delete('/:assetId', async (req, res) => {
  try {
    const auth = await authorizeFlow(req, true);
    if ('error' in auth) return res.status(auth.status ?? 400).json({ error: auth.error });
    const assetId = Number(req.params.assetId);
    if (!Number.isInteger(assetId) || assetId <= 0) return res.status(400).json({ error: 'Invalid media item ID' });
    const asset = await storage.getFlowMediaAsset(assetId);
    if (!asset || asset.flowId !== auth.flowId || asset.companyId !== auth.companyId) return res.status(404).json({ error: 'Media item not found' });
    await storage.deleteFlowMediaAsset(asset.id);
    await fsExtra.unlink(path.join(uploadDirectory, path.basename(asset.fileUrl))).catch(() => undefined);
    await deleteMediaFileOwnership(asset.fileUrl).catch(() => undefined);
    void dataUsageTracker.trackFileDelete(auth.companyId, asset.fileSize);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Delete failed' });
  }
});

export default router;
