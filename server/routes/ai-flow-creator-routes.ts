import crypto from 'crypto';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import os from 'os';
import path from 'path';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { ensureAuthenticated, requirePermission } from '../middleware';
import { PERMISSIONS, type User } from '@shared/schema';
import { storage } from '../storage';
import { userCanAccessFlow } from '../utils/flow-access';
import { aiFlowCreatorService, AiFlowCreatorModeMismatchError } from '../services/ai-flow-creator';
import {
  aiFlowCreatorPersistenceService,
  redactCreatorText,
} from '../services/ai-flow-creator-persistence';
import type { AiFlowCreatorAttachmentDescriptor, AiFlowGenerationEvent, FlowGraphDraft } from '@shared/types/ai-flow-creator';
import { hashFlowGraph } from '@shared/flow-graph-validator';
import { logger } from '../utils/logger';
import googleSheetsService from '../services/google-sheets';
import { aiCredentialsService } from '../services/ai-credentials-service';
import { TextDocumentProcessor } from '../services/document-processors/text-processor';
import { hasExpectedCreatorAttachmentSignature } from '../services/ai-flow-creator-attachments';
import { aiCreatorModelSupportsImage, aiCreatorVisionFallback } from '@shared/ai-providers';
import { getCompanyErpBusinessType } from './erp/business-type';
import { getErpCapabilityManifest } from '@shared/erp-capabilities';
import { listLocalBookableCatalog, listLocalBookableDentists } from '../services/dental-ai-booking-adapter';
import { mapAiFlowCreatorCustomFields } from '../services/ai-flow-creator-resources';

const router = Router();

const CREATOR_ATTACHMENT_DIRECTORY = path.join(os.tmpdir(), 'bothive-ai-flow-creator');
const CREATOR_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
const CREATOR_ATTACHMENT_MAX_COUNT = 5;
const CREATOR_REFERENCE_MAX_CHARS = 120_000;
const CREATOR_REFERENCE_FILE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.webp', '.pdf', '.doc', '.docx', '.txt', '.md', '.markdown', '.csv', '.xls', '.xlsx', '.json',
]);
const CREATOR_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

fs.mkdirSync(CREATOR_ATTACHMENT_DIRECTORY, { recursive: true });

const creatorAttachmentUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, CREATOR_ATTACHMENT_DIRECTORY),
    filename: (_req, _file, callback) => callback(null, crypto.randomUUID()),
  }),
  limits: { files: CREATOR_ATTACHMENT_MAX_COUNT, fileSize: CREATOR_ATTACHMENT_MAX_BYTES },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!CREATOR_REFERENCE_FILE_EXTENSIONS.has(extension)) return callback(new Error('Unsupported reference file type'));
    callback(null, true);
  },
}).array('attachments', CREATOR_ATTACHMENT_MAX_COUNT);

function creatorMultipartMiddleware(req: any, res: any, next: any) {
  if (!req.is('multipart/form-data')) return next();
  creatorAttachmentUpload(req, res, async (error: unknown) => {
    if (!error) return next();
    await cleanupCreatorAttachments((req.files ?? []) as Express.Multer.File[]);
    const message = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
      ? 'Each reference file must be 10MB or smaller'
      : error instanceof multer.MulterError && error.code === 'LIMIT_FILE_COUNT'
        ? 'Attach no more than five reference files'
        : error instanceof Error && error.message === 'Unsupported reference file type'
          ? 'This reference file type is not supported'
          : 'Unable to read the reference files';
    return res.status(400).json({ message });
  });
}

function normalizedAttachmentMime(file: Express.Multer.File): string {
  const extension = path.extname(file.originalname).toLowerCase();
  const byExtension: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
    '.pdf': 'application/pdf', '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.txt': 'text/plain', '.md': 'text/markdown', '.markdown': 'text/markdown', '.csv': 'text/csv',
    '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.json': 'application/json',
  };
  return byExtension[extension] ?? file.mimetype;
}

async function prepareCreatorAttachments(files: Express.Multer.File[]): Promise<Array<AiFlowCreatorAttachmentDescriptor & { extractedText?: string; dataUrl?: string }>> {
  const prepared: Array<AiFlowCreatorAttachmentDescriptor & { extractedText?: string; dataUrl?: string }> = [];
  let remainingCharacters = CREATOR_REFERENCE_MAX_CHARS;
  for (const file of files) {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!CREATOR_REFERENCE_FILE_EXTENSIONS.has(extension)) throw new Error(`Unsupported reference file: ${file.originalname}`);
    const bytes = await fsPromises.readFile(file.path);
    if (!hasExpectedCreatorAttachmentSignature(extension, bytes)) throw new Error(`The contents of ${file.originalname} do not match its file type`);
    const mimeType = normalizedAttachmentMime(file);
    if (CREATOR_IMAGE_EXTENSIONS.has(extension)) {
      prepared.push({ name: path.basename(file.originalname), mimeType, size: file.size, kind: 'image', dataUrl: `data:${mimeType};base64,${bytes.toString('base64')}` });
      continue;
    }
    await TextDocumentProcessor.validateFile(file.path, mimeType, CREATOR_ATTACHMENT_MAX_BYTES);
    const extracted = await TextDocumentProcessor.extractText(file.path, mimeType, file.originalname, { fileBuffer: bytes });
    const clipped = extracted.slice(0, Math.max(0, remainingCharacters));
    remainingCharacters -= clipped.length;
    prepared.push({ name: path.basename(file.originalname), mimeType, size: file.size, kind: 'document', extractedText: clipped });
  }
  return prepared;
}

async function cleanupCreatorAttachments(files: Express.Multer.File[]): Promise<void> {
  await Promise.all(files.map((file) => fsPromises.unlink(file.path).catch(() => undefined)));
}

const graphNodeSchema = z.object({
  id: z.string(),
  type: z.string(),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.record(z.unknown()).default({}),
}).passthrough();

const graphEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().nullable().optional(),
  targetHandle: z.string().nullable().optional(),
  data: z.record(z.unknown()).optional(),
}).passthrough();

const generationRequestSchema = z.object({
  flowId: z.number().int().positive().optional(),
  instruction: z.string().trim().min(1, 'Enter a workflow instruction').max(20000),
  currentGraph: z.object({
    name: z.string().optional(),
    nodes: z.array(graphNodeSchema).max(300),
    edges: z.array(graphEdgeSchema).max(600),
    customVariables: z.array(z.record(z.unknown())).max(500).optional(),
  }),
  provider: z.enum(['openai', 'openrouter', 'azure']).default('openai'),
  credentialSource: z.enum(['auto', 'company', 'system', 'manual']).default('auto'),
  model: z.string().max(200).optional(),
  manualApiKey: z.string().max(10000).optional(),
  azureEndpoint: z.string().max(1000).optional(),
  azureApiVersion: z.string().max(100).optional(),
  conversationHistory: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(30000) })).max(50).optional(),
  previousModel: z.string().max(200).optional(),
  modelSupportsImage: z.boolean().optional(),
  mode: z.enum(['normal', 'interactive']).default('interactive'),
});

const promptEnhancementRequestSchema = generationRequestSchema.pick({
  flowId: true,
  instruction: true,
  currentGraph: true,
  provider: true,
  credentialSource: true,
  model: true,
  manualApiKey: true,
  azureEndpoint: true,
  azureApiVersion: true,
});

async function requireFlowAccess(flowId: number, user: User) {
  const flow = await storage.getFlow(flowId);
  if (!flow) return { ok: false as const, status: 404, message: 'Flow not found' };
  if (!userCanAccessFlow(flow, user)) return { ok: false as const, status: 403, message: 'You do not have permission to access this flow' };
  return { ok: true as const, flow };
}

async function collectAccessibleResources(user: User, currentFlowId?: number): Promise<Record<string, unknown>> {
  const companyId = user.companyId!;
  const businessType = await getCompanyErpBusinessType(companyId);
  const [flows, pipelines, connections, contactCustomFields, dealCustomFields, dealTags, sheetsStatus, aiAvailability, productsResult, modeResources] = await Promise.all([
    storage.getAccessibleFlows(user),
    storage.getPipelines(),
    storage.getChannelConnectionsByCompany(companyId),
    storage.getCompanyCustomFields(companyId, 'contact'),
    storage.getCompanyCustomFields(companyId, 'deal'),
    storage.getDealTags(companyId),
    googleSheetsService.checkUserAuthentication(user.id, companyId).catch(() => ({ connected: false, message: 'Status unavailable' })),
    Promise.all(['openai', 'openrouter', 'azure'].map(async (provider) => ({
      provider,
      available: Boolean(await aiCredentialsService.getCredentialWithPreference(companyId, provider, 'auto').catch(() => null)),
    }))),
    storage.getProducts(companyId, { status: 'active', limit: 101 }).catch(() => ({ data: [], total: 0 })),
    businessType === 'restaurant'
      ? storage.getRestaurantTables(companyId).then((tables) => {
          const availableTables = tables.filter((table) => table.isActive !== false && table.isReservable !== false);
          return {
            tables: availableTables.slice(0, 100).map((table) => ({ id: table.id, label: table.label, code: table.code, capacity: table.capacity })),
            tablesTruncated: availableTables.length > 100,
          };
        }).catch(() => ({}))
      : businessType === 'dental'
        ? Promise.all([
            listLocalBookableCatalog(companyId),
            listLocalBookableDentists(companyId, {}),
          ]).then(([catalog, providers]) => ({
            services: catalog.slice(0, 100).map((item) => ({ id: item.id, productId: item.productId ?? null, name: item.label, durationMinutes: item.durationMinutes, specialtyId: item.specialtyId })),
            servicesTruncated: catalog.length > 100,
            providers: providers.slice(0, 100).map((provider) => ({ id: provider.userId, name: provider.displayName, specialtyIds: provider.specialtyIds })),
            providersTruncated: providers.length > 100,
          })).catch(() => ({}))
        : Promise.resolve({}),
  ]);
  const companyPipelines = pipelines.filter((pipeline) => pipeline.companyId === companyId);
  const stages = (await Promise.all(companyPipelines.map((pipeline) => storage.getPipelineStagesByPipeline(pipeline.id)))).flat();
  return {
    flows: flows
      .filter((flow) => flow.id !== currentFlowId)
      .map((flow) => ({ id: flow.id, name: flow.name, status: flow.status })),
    pipelines: companyPipelines
      .map((pipeline) => ({ id: pipeline.id, name: pipeline.name, isDefault: Boolean(pipeline.isDefault) })),
    pipelineStages: stages
      .filter((stage) => stage.companyId == null || stage.companyId === companyId)
      .map((stage) => ({ id: stage.id, pipelineId: stage.pipelineId, name: stage.name, order: stage.order })),
    contactCustomFields: mapAiFlowCreatorCustomFields(contactCustomFields, 'contact'),
    dealCustomFields: mapAiFlowCreatorCustomFields(dealCustomFields, 'deal'),
    dealTags,
    channels: connections.map((connection) => ({ id: connection.id, type: connection.channelType, name: connection.accountName, status: connection.status })),
    setupAvailability: {
      googleSheetsConnected: sheetsStatus.connected,
      aiProviders: Object.fromEntries(aiAvailability.map((entry) => [entry.provider, entry.available])),
    },
    erp: {
      ...getErpCapabilityManifest(businessType),
      products: productsResult.data.slice(0, 100).map((product) => ({
        id: product.id,
        name: product.name,
        sku: product.sku ?? null,
        type: product.type,
        unitPrice: product.unitPrice,
        currency: product.currency,
        estimatedDurationMinutes: product.estimatedDurationMinutes ?? null,
      })),
      productsTruncated: productsResult.total > 100,
      ...modeResources,
    },
  };
}

router.post(
  '/ai-flow-creator/enhance-prompt',
  ensureAuthenticated,
  requirePermission(PERMISSIONS.MANAGE_FLOWS),
  async (req: any, res) => {
    const parsed = promptEnhancementRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return res.status(400).json({
        message: firstIssue?.message || 'Invalid prompt enhancement request',
        details: parsed.error.issues,
      });
    }
    const user = req.user as User;
    if (!user.companyId) return res.status(403).json({ message: 'A company account is required' });
    if (parsed.data.flowId) {
      const access = await requireFlowAccess(parsed.data.flowId, user);
      if (!access.ok) return res.status(access.status).json({ message: access.message });
    }

    const controller = new AbortController();
    const abort = () => controller.abort();
    req.once('aborted', abort);
    try {
      const accessibleResources = await collectAccessibleResources(user, parsed.data.flowId);
      const result = await aiFlowCreatorService.enhancePrompt({
        userId: user.id,
        companyId: user.companyId,
        request: { ...parsed.data, accessibleResources },
        signal: controller.signal,
      });
      return res.json(result);
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = redactCreatorText(error instanceof Error ? error.message : 'Prompt enhancement failed');
      const status = /credential|api key|azure endpoint|deployment\/model|required variables|already running/i.test(message) ? 400 : 500;
      logger.error('AIFlowCreator', 'Prompt enhancement failed', { userId: user.id, flowId: parsed.data.flowId, error: message });
      return res.status(status).json({ message });
    } finally {
      req.off('aborted', abort);
    }
  },
);

router.post(
  '/ai-flow-creator/generations',
  ensureAuthenticated,
  requirePermission(PERMISSIONS.MANAGE_FLOWS),
  creatorMultipartMiddleware,
  async (req: any, res) => {
    const uploadedFiles = (req.files ?? []) as Express.Multer.File[];
    try {
      let requestBody = req.body;
      if (req.is('multipart/form-data')) {
        try {
          requestBody = JSON.parse(String(req.body?.request ?? ''));
        } catch {
          return res.status(400).json({ message: 'Invalid generation request' });
        }
      }
      const parsed = generationRequestSchema.safeParse(requestBody);
      if (!parsed.success) {
        const firstIssue = parsed.error.issues[0];
        return res.status(400).json({
          message: firstIssue?.message || 'Invalid generation request',
          details: parsed.error.issues,
        });
      }
      const user = req.user as User;
      if (!user.companyId) return res.status(403).json({ message: 'A company account is required' });
      if (parsed.data.flowId) {
        const access = await requireFlowAccess(parsed.data.flowId, user);
        if (!access.ok) return res.status(access.status).json({ message: access.message });
      }

      let referenceAttachments: Awaited<ReturnType<typeof prepareCreatorAttachments>> = [];
      try {
        referenceAttachments = await prepareCreatorAttachments(uploadedFiles);
      } catch (error) {
        return res.status(400).json({ message: error instanceof Error ? error.message : 'Unable to process the reference files' });
      }
      const hasImages = referenceAttachments.some((attachment) => attachment.kind === 'image');
      const requestedModel = parsed.data.model?.trim() ?? '';
      let selectedModel = requestedModel;
      if (hasImages && selectedModel && parsed.data.modelSupportsImage !== true && !aiCreatorModelSupportsImage(parsed.data.provider, selectedModel)) {
        if (parsed.data.provider === 'azure') {
          return res.status(400).json({ message: 'Select an image-capable Azure deployment to use image references' });
        }
        selectedModel = aiCreatorVisionFallback(parsed.data.provider);
      }

      const generationId = crypto.randomUUID();
      const controller = new AbortController();
      let closed = false;
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      const cleanupStream = () => {
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = undefined;
      };
      const abort = () => {
        closed = true;
        cleanupStream();
        controller.abort();
      };
      req.on('aborted', abort);
      res.on('close', abort);
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.flushHeaders?.();

      const flush = () => (res as typeof res & { flush?: () => void }).flush?.();
      const send = (event: AiFlowGenerationEvent) => {
        if (!closed && !res.writableEnded) {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
          flush();
        }
      };
      send({ type: 'started', generationId });
      heartbeat = setInterval(() => {
        if (!closed && !res.writableEnded) {
          res.write(': heartbeat\n\n');
          flush();
        }
      }, 15_000);
      const previousModel = parsed.data.previousModel?.trim() || requestedModel;
      if (previousModel && selectedModel && previousModel !== selectedModel) {
        send({ type: 'model_adjusted', generationId, previousModel, model: selectedModel, reason: 'image_support' });
      }

      try {
        const accessibleResources = await collectAccessibleResources(user, parsed.data.flowId);
        const result = await aiFlowCreatorService.generateLive({
          userId: user.id,
          companyId: user.companyId,
          generationId,
          request: { ...parsed.data, model: selectedModel || parsed.data.model, accessibleResources, referenceAttachments } as Parameters<typeof aiFlowCreatorService.generateLive>[0]['request'],
          signal: controller.signal,
          emitPhase: (phase) => {
            send({ type: 'phase', generationId, ...phase });
          },
          emitAssistantDelta: (messageId, delta) => send({ type: 'assistant_delta', generationId, messageId, delta }),
          emitOperationStarted: (operationId, operationType, label, nodeId, edgeId, field) => send({
            type: 'operation_started', generationId, operationId,
            operationType: operationType as import('@shared/types/ai-flow-creator').AiFlowCreatorGraphOperation['type'],
            label, nodeId, edgeId, field,
          }),
          emitOperationApplied: (operation, draft) => send({ type: 'operation_applied', generationId, operation, draft }),
          emitOperationRejected: (operationId, operationType, label, message) => send({ type: 'operation_rejected', generationId, operationId, operationType, label, message }),
          emitCanvasFocus: (nodeId, field) => send({ type: 'canvas_focus', generationId, nodeId, field }),
        });
        for (const assumption of result.assumptions) send({ type: 'assumption', generationId, assumption });
        for (const node of result.draft.nodes) send({ type: 'node', generationId, node });
        for (const edge of result.draft.edges) send({ type: 'edge', generationId, edge });
        send({ type: 'validation', generationId, result: result.validation });

        if (parsed.data.flowId) {
          await aiFlowCreatorPersistenceService.appendMessage({
            flowId: parsed.data.flowId,
            companyId: user.companyId,
            userId: user.id,
            generationId,
            provider: result.provider,
            model: result.model,
            credentialSource: result.credentialSource,
            role: 'user',
            content: parsed.data.instruction,
          });
          await aiFlowCreatorPersistenceService.appendMessage({
            flowId: parsed.data.flowId,
            companyId: user.companyId,
            userId: user.id,
            generationId,
            provider: result.provider,
            model: result.model,
            credentialSource: result.credentialSource,
            role: 'assistant',
            kind: 'generation',
            content: result.summary,
            metadata: {
              beforeGraphHash: hashFlowGraph(parsed.data.currentGraph),
              generatedGraphHash: result.graphHash,
              assumptions: result.assumptions,
              validation: result.validation,
              activity: result.activity,
            },
          });
        }
        send({ type: 'complete', ...result });
      } catch (error) {
        if (!controller.signal.aborted) {
          logger.error('AIFlowCreator', 'Generation failed', { userId: user.id, flowId: parsed.data.flowId, error: error instanceof Error ? error.message : String(error) });
          if (error instanceof AiFlowCreatorModeMismatchError) {
            send({ type: 'error', generationId, code: error.code, message: error.message, retryable: false, activeBusinessType: error.activeBusinessType, requestedBusinessType: error.requestedBusinessType });
          } else {
            send({ type: 'error', generationId, code: 'GENERATION_FAILED', message: redactCreatorText(error instanceof Error ? error.message : 'Workflow generation failed'), retryable: true });
          }
        }
      } finally {
        cleanupStream();
        if (!res.writableEnded) res.end();
      }
    } finally {
      await cleanupCreatorAttachments(uploadedFiles);
    }
  },
);

router.get(
  '/flows/:flowId/ai-creator/history',
  ensureAuthenticated,
  requirePermission(PERMISSIONS.MANAGE_FLOWS),
  async (req: any, res) => {
    const flowId = Number(req.params.flowId);
    if (!Number.isInteger(flowId) || flowId <= 0) return res.status(400).json({ message: 'Invalid flow ID' });
    const access = await requireFlowAccess(flowId, req.user as User);
    if (!access.ok) return res.status(access.status).json({ message: access.message });
    return res.json(await aiFlowCreatorPersistenceService.getHistory(flowId));
  },
);

router.delete(
  '/flows/:flowId/ai-creator/messages',
  ensureAuthenticated,
  requirePermission(PERMISSIONS.MANAGE_FLOWS),
  async (req: any, res) => {
    const flowId = Number(req.params.flowId);
    if (!Number.isInteger(flowId) || flowId <= 0) return res.status(400).json({ message: 'Invalid flow ID' });
    const access = await requireFlowAccess(flowId, req.user as User);
    if (!access.ok) return res.status(access.status).json({ message: access.message });
    return res.json({ deletedCount: await aiFlowCreatorPersistenceService.clearMessages(flowId) });
  },
);

export default router;
