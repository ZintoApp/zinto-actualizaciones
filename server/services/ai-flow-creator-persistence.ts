import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import {
  aiFlowCreatorMessages,
  aiFlowCreatorRevisions,
  aiFlowCreatorThreads,
} from '@shared/schema';
import { hashFlowGraph, validateFlowGraph } from '@shared/flow-graph-validator';
import type {
  AiCreatorCommitMetadata,
  AiFlowCreatorActivityEntry,
  AiFlowCreatorHistory,
  FlowGraphDraft,
  FlowValidationIssue,
  FlowValidationResult,
} from '@shared/types/ai-flow-creator';
import googleSheetsService from './google-sheets';
import { aiCredentialsService } from './ai-credentials-service';
import { reconcileCreatorCommitWithStoredGeneration } from './ai-flow-creator-commit';
import {
  redactCreatorText,
  sanitizeCreatorValue,
} from './ai-flow-creator-sanitization';
import { getCompanyErpBusinessType } from '../routes/erp/business-type';

export { redactCreatorText, sanitizeFlowGraphForCreator } from './ai-flow-creator-sanitization';

const validationIssueSchema = z.object({
  severity: z.enum(['structural', 'setup', 'warning']),
  code: z.string(),
  message: z.string(),
  nodeId: z.string().optional(),
  edgeId: z.string().optional(),
  field: z.string().optional(),
  requirementKey: z.string().optional(),
});

const validationResultSchema = z.object({
  valid: z.boolean(),
  issues: z.array(validationIssueSchema),
  structuralIssues: z.array(validationIssueSchema),
  setupIssues: z.array(validationIssueSchema),
  warnings: z.array(validationIssueSchema),
});

export const aiCreatorCommitSchema = z.object({
  generationId: z.string().uuid(),
  generationProof: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  provider: z.enum(['openai', 'openrouter', 'azure']).optional(),
  model: z.string().max(200).optional(),
  credentialSource: z.enum(['auto', 'company', 'system', 'manual']).optional(),
  generatedGraphHash: z.string().min(8).max(128),
  beforeGraphHash: z.string().min(8).max(128),
  acceptedGraphHash: z.string().min(8).max(128),
  prompt: z.string().max(20000).optional(),
  summary: z.string().min(1).max(10000),
  assumptions: z.array(z.string().max(2000)).max(50),
  validation: validationResultSchema,
  temporaryMessages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(30000) })).max(100).optional(),
});

function normalizeValidation(value: unknown): FlowValidationResult {
  const parsed = validationResultSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  return { valid: false, issues: [], structuralIssues: [], setupIssues: [], warnings: [] };
}

async function resolveExternalSetupIssues(
  issues: FlowValidationIssue[],
  context?: { userId?: number | null; companyId?: number | null },
  graph?: FlowGraphDraft,
): Promise<FlowValidationIssue[]> {
  if (!context?.userId || !context.companyId) return issues;
  let resolvedIssues = issues;
  const needsGoogleSheets = issues.some((issue) => issue.requirementKey === 'google-sheets-oauth');
  if (needsGoogleSheets) {
    try {
      const status = await googleSheetsService.checkUserAuthentication(context.userId, context.companyId);
      if (status.connected) {
        resolvedIssues = resolvedIssues.filter((issue) => issue.requirementKey !== 'google-sheets-oauth');
      }
    } catch (error) {
      console.warn('[AI Flow Creator] Could not re-evaluate Google Sheets OAuth status:', error);
    }
  }

  for (const node of graph?.nodes.filter((candidate) => candidate.type === 'ai_assistant') ?? []) {
    const source = String(node.data.credentialSource ?? 'auto');
    if (!['auto', 'company', 'system'].includes(source)) continue;
    const provider = String(node.data.provider ?? 'openai');
    try {
      const credential = await aiCredentialsService.getCredentialWithPreference(context.companyId, provider, source as 'auto' | 'company' | 'system');
      if (credential?.apiKey) continue;
    } catch {
      // The issue below intentionally hides credential resolution details.
    }
    const alreadyPresent = resolvedIssues.some((issue) => issue.nodeId === node.id && issue.requirementKey === 'assistant-llm');
    if (!alreadyPresent) {
      resolvedIssues = [...resolvedIssues, {
        severity: 'setup',
        code: 'missing_shared_ai_credential',
        message: `AI Assistant requires an available ${provider} credential before activation.`,
        nodeId: node.id,
        requirementKey: 'assistant-llm',
      }];
    }
  }
  return resolvedIssues;
}

export class AiFlowCreatorPersistenceService {
  async validateForCommit(
    graph: FlowGraphDraft,
    context?: { userId?: number | null; companyId?: number | null },
  ): Promise<FlowValidationResult> {
    const erpBusinessType = context?.companyId
      ? await getCompanyErpBusinessType(context.companyId)
      : undefined;
    const validation = validateFlowGraph(graph, { mode: 'activation', erpBusinessType });
    const setupIssues = await resolveExternalSetupIssues(validation.setupIssues, context, graph);
    const issues = [...validation.structuralIssues, ...setupIssues, ...validation.warnings];
    return {
      valid: validation.structuralIssues.length === 0,
      issues,
      structuralIssues: validation.structuralIssues,
      setupIssues,
      warnings: validation.warnings,
    };
  }

  async ensureThread(params: { flowId: number; companyId: number; userId: number; provider?: string; model?: string; credentialSource?: string }) {
    const [existing] = await db.select().from(aiFlowCreatorThreads).where(eq(aiFlowCreatorThreads.flowId, params.flowId)).limit(1);
    if (existing) {
      const [updated] = await db.update(aiFlowCreatorThreads).set({
        provider: params.provider ?? existing.provider,
        model: params.model ?? existing.model,
        credentialSource: params.credentialSource ?? existing.credentialSource,
        updatedAt: new Date(),
      }).where(eq(aiFlowCreatorThreads.id, existing.id)).returning();
      return updated ?? existing;
    }
    const [created] = await db.insert(aiFlowCreatorThreads).values({
      flowId: params.flowId,
      companyId: params.companyId,
      createdBy: params.userId,
      provider: params.provider,
      model: params.model,
      credentialSource: params.credentialSource,
    }).returning();
    return created;
  }

  async appendMessage(params: {
    flowId: number;
    companyId: number;
    userId: number;
    generationId?: string;
    provider?: string;
    model?: string;
    credentialSource?: string;
    role: 'user' | 'assistant';
    kind?: string;
    content: string;
    metadata?: Record<string, unknown>;
  }) {
    const thread = await this.ensureThread(params);
    const [message] = await db.insert(aiFlowCreatorMessages).values({
      threadId: thread.id,
      userId: params.userId,
      generationId: params.generationId,
      role: params.role,
      kind: params.kind ?? 'message',
      content: redactCreatorText(params.content),
      metadata: sanitizeCreatorValue(params.metadata ?? {}) as Record<string, unknown>,
    }).returning();
    return message;
  }

  async getHistory(flowId: number): Promise<AiFlowCreatorHistory> {
    const [thread] = await db.select().from(aiFlowCreatorThreads).where(eq(aiFlowCreatorThreads.flowId, flowId)).limit(1);
    if (!thread) return { messages: [], revisions: [] };
    const [messages, revisions] = await Promise.all([
      db.select().from(aiFlowCreatorMessages).where(eq(aiFlowCreatorMessages.threadId, thread.id)).orderBy(aiFlowCreatorMessages.createdAt),
      db.select().from(aiFlowCreatorRevisions).where(eq(aiFlowCreatorRevisions.flowId, flowId)).orderBy(desc(aiFlowCreatorRevisions.createdAt)),
    ]);
    return {
      messages: messages
        .filter((message) => (message.metadata as Record<string, unknown> | null)?.hidden !== true)
        .map((message) => {
          const metadata = message.metadata as Record<string, unknown> | null;
          const activity = Array.isArray(metadata?.activity)
            ? metadata.activity.filter((entry): entry is AiFlowCreatorActivityEntry => Boolean(entry && typeof entry === 'object' && typeof (entry as Record<string, unknown>).text === 'string'))
            : undefined;
          return { id: message.id, role: message.role, kind: message.kind, content: message.content, createdAt: message.createdAt, ...(activity?.length ? { activity } : {}) };
        }),
      revisions: revisions.map((revision) => ({
        id: revision.id,
        generationId: revision.generationId,
        summary: revision.summary,
        assumptions: Array.isArray(revision.assumptions) ? revision.assumptions.filter((entry): entry is string => typeof entry === 'string') : [],
        validation: normalizeValidation(revision.validation),
        beforeGraphHash: revision.beforeGraphHash,
        generatedGraphHash: revision.generatedGraphHash,
        acceptedGraphHash: revision.acceptedGraphHash,
        savedGraphHash: revision.savedGraphHash,
        createdAt: revision.createdAt,
      })),
    };
  }

  async clearMessages(flowId: number): Promise<number> {
    const [thread] = await db.select().from(aiFlowCreatorThreads).where(eq(aiFlowCreatorThreads.flowId, flowId)).limit(1);
    if (!thread) return 0;
    const generationRecords = (await db.select().from(aiFlowCreatorMessages).where(eq(aiFlowCreatorMessages.threadId, thread.id)))
      .filter((message) => message.role === 'assistant' && message.kind === 'generation' && message.generationId);
    const deleted = await db.delete(aiFlowCreatorMessages).where(eq(aiFlowCreatorMessages.threadId, thread.id)).returning({ id: aiFlowCreatorMessages.id });
    if (generationRecords.length) {
      await db.insert(aiFlowCreatorMessages).values(generationRecords.map((message) => ({
        threadId: thread.id,
        userId: message.userId,
        generationId: message.generationId,
        role: 'assistant' as const,
        kind: 'generation',
        content: '[Creator generation record]',
        metadata: { ...(message.metadata as Record<string, unknown> ?? {}), hidden: true },
      })));
    }
    return deleted.length;
  }

  async resolveVerifiedSavedGeneration(
    flowId: number,
    companyId: number,
    userId: number,
    metadata: AiCreatorCommitMetadata,
  ): Promise<AiCreatorCommitMetadata | null> {
    const [thread] = await db.select().from(aiFlowCreatorThreads).where(and(
      eq(aiFlowCreatorThreads.flowId, flowId),
      eq(aiFlowCreatorThreads.companyId, companyId),
    )).limit(1);
    if (!thread) return null;
    const [message] = await db.select().from(aiFlowCreatorMessages).where(and(
      eq(aiFlowCreatorMessages.threadId, thread.id),
      eq(aiFlowCreatorMessages.generationId, metadata.generationId),
      eq(aiFlowCreatorMessages.role, 'assistant'),
      eq(aiFlowCreatorMessages.kind, 'generation'),
      eq(aiFlowCreatorMessages.userId, userId),
    )).limit(1);
    if (!message) return null;
    const storedHash = (message.metadata as Record<string, unknown> | null)?.generatedGraphHash;
    const storedBeforeHash = (message.metadata as Record<string, unknown> | null)?.beforeGraphHash;
    // The stored audit hash was calculated from the exact graph received by the generation endpoint.
    // Reuse it instead of trusting a browser-side re-hash after JSON/UI normalization.
    return reconcileCreatorCommitWithStoredGeneration({
      metadata,
      storedGeneratedGraphHash: storedHash,
      storedBeforeGraphHash: storedBeforeHash,
      userId,
      companyId,
    });
  }

  async verifySavedGeneration(flowId: number, companyId: number, userId: number, metadata: AiCreatorCommitMetadata): Promise<boolean> {
    return Boolean(await this.resolveVerifiedSavedGeneration(flowId, companyId, userId, metadata));
  }

  async recordAppliedRevision(params: {
    flowId: number;
    companyId: number;
    userId: number;
    graph: FlowGraphDraft;
    metadata: AiCreatorCommitMetadata;
    provider?: string;
    model?: string;
    credentialSource?: string;
  }): Promise<void> {
    const metadata = aiCreatorCommitSchema.parse(params.metadata);
    const savedGraphHash = hashFlowGraph(params.graph);
    const serverValidation = await this.validateForCommit(params.graph, params);
    const thread = await this.ensureThread(params);

    if (metadata.temporaryMessages?.length) {
      for (const message of metadata.temporaryMessages) {
        await db.insert(aiFlowCreatorMessages).values({
          threadId: thread.id,
          userId: params.userId,
          generationId: metadata.generationId,
          role: message.role,
          kind: 'message',
          content: redactCreatorText(message.content),
          metadata: {},
        });
      }
    }

    const setupRequirements = serverValidation.setupIssues;
    await db.insert(aiFlowCreatorRevisions).values({
      threadId: thread.id,
      flowId: params.flowId,
      companyId: params.companyId,
      createdBy: params.userId,
      generationId: metadata.generationId,
      status: savedGraphHash === metadata.acceptedGraphHash ? 'applied' : 'applied_with_manual_edits',
      summary: redactCreatorText(metadata.summary),
      assumptions: metadata.assumptions.map(redactCreatorText),
      validation: sanitizeCreatorValue(metadata.validation) as Record<string, unknown>,
      setupRequirements: sanitizeCreatorValue(setupRequirements) as FlowValidationIssue[],
      beforeGraphHash: metadata.beforeGraphHash,
      generatedGraphHash: metadata.generatedGraphHash,
      acceptedGraphHash: metadata.acceptedGraphHash,
      savedGraphHash,
    }).onConflictDoNothing({ target: aiFlowCreatorRevisions.generationId });
  }

  async getActivationBlockers(
    flowId: number,
    graph: FlowGraphDraft,
    context?: { userId?: number | null; companyId?: number | null },
  ): Promise<FlowValidationIssue[]> {
    const [revision] = await db.select().from(aiFlowCreatorRevisions).where(eq(aiFlowCreatorRevisions.flowId, flowId)).orderBy(desc(aiFlowCreatorRevisions.createdAt)).limit(1);
    if (!revision) return [];
    const requirements = Array.isArray(revision.setupRequirements)
      ? revision.setupRequirements.filter((entry): entry is FlowValidationIssue => Boolean(entry && typeof entry === 'object'))
      : [];
    if (!requirements.length) return [];
    const erpBusinessType = context?.companyId
      ? await getCompanyErpBusinessType(context.companyId)
      : undefined;
    const current = await resolveExternalSetupIssues(validateFlowGraph(graph, { mode: 'activation', erpBusinessType }).setupIssues, context, graph);
    const requiredKeys = new Set(requirements.map((entry) => `${entry.nodeId ?? ''}:${entry.requirementKey ?? entry.code}`));
    return current.filter((entry) => requiredKeys.has(`${entry.nodeId ?? ''}:${entry.requirementKey ?? entry.code}`));
  }
}

export const aiFlowCreatorPersistenceService = new AiFlowCreatorPersistenceService();
