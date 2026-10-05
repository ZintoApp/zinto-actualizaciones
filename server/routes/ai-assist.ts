import { Router } from 'express';
import OpenAI from 'openai';
import { ensureAuthenticated } from '../middleware';
import { z } from 'zod';
import { aiTextAssistService } from '../services/ai-text-assist-service';
import { aiCredentialsService, azureConnectionFromCredentialSource } from '../services/ai-credentials-service';
import { createAzureOpenAIRestClient } from '../services/azure-openai';
import { logger } from '../utils/logger';
import { aiLlmProviderSchema, usesModernChatCompletionParameters } from '@shared/ai-providers';
import {
  ENHANCE_SYSTEM_PROMPT_META,
  normalizeEnhancedSystemPrompt,
} from '../services/ai-system-prompt-enhancer';
import { redactCreatorText } from '../services/ai-flow-creator-sanitization';

const router = Router();

const assistRequestSchema = z
  .object({
    action: z.enum([
      'improve',
      'fix_grammar',
      'polite',
      'friendly',
      'shorten',
      'lengthen',
      'simplify',
      'tone',
      'translate',
      'continue',
      'summarize_reply',
      'custom',
    ]),
    text: z.string().max(4000),
    toneVariant: z
      .enum(['formal', 'empathetic', 'apologetic', 'persuasive', 'enthusiastic'])
      .optional(),
    targetLanguage: z.string().min(2).max(64).optional(),
    instruction: z.string().max(500).optional(),
    conversationId: z.number().int().positive().optional(),
    recentMessages: z
      .array(
        z.object({
          role: z.enum(['agent', 'contact']),
          content: z.string().max(2000),
          createdAt: z.string().optional(),
        }),
      )
      .max(10)
      .optional(),
  })
  .superRefine((data, ctx) => {
    const draftOptionalActions = new Set(['summarize_reply', 'custom']);

    if (!draftOptionalActions.has(data.action) && !data.text.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'text is required for this action',
        path: ['text'],
      });
    }

    if (data.action === 'summarize_reply' && !data.text.trim() && !data.recentMessages?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'recentMessages is required when summarize_reply has no draft text',
        path: ['recentMessages'],
      });
    }

    if (data.action === 'tone' && !data.toneVariant) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'toneVariant is required when action is tone',
        path: ['toneVariant'],
      });
    }
    if (data.action === 'translate' && !data.targetLanguage) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'targetLanguage is required when action is translate',
        path: ['targetLanguage'],
      });
    }
    if (data.action === 'custom' && !data.instruction?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'instruction is required when action is custom',
        path: ['instruction'],
      });
    }
  });

const generateSystemPromptSchema = z.object({
  message: z.string().min(1).max(5000),
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string()
      })
    )
    .default([]),
  provider: aiLlmProviderSchema.default('openai'),
  credentialSource: z.enum(['auto', 'company', 'system', 'manual']).default('auto'),
  model: z.string().optional(),
  azureEndpoint: z.string().optional(),
  azureApiVersion: z.string().optional(),
  manualApiKey: z.string().optional(),
  /** Alias for manualApiKey (e.g. node field name); manualApiKey takes precedence when both are sent */
  apiKey: z.string().optional()
});

const generateCodeSchema = generateSystemPromptSchema.extend({
  currentCode: z.string().max(50000).optional().default(''),
});

const enhanceSystemPromptSchema = generateSystemPromptSchema
  .omit({ message: true, conversationHistory: true })
  .extend({ prompt: z.string().trim().min(1).max(30000) });

/** Meta-prompt for LLM: outputs only the assistant system prompt text, suitable for the System Prompt field */
const GENERATE_SYSTEM_PROMPT_META = `You are an expert prompt engineer for conversational AI assistants.

Your task:
- When the user describes their business, product, or use case, generate a professional, detailed system prompt for an AI assistant that will serve that context.
- On follow-up turns, refine the previously generated system prompt based on the user's feedback and new details.

Output rules (strict):
- Output ONLY the system prompt text itself. No preamble, no title line, no markdown code fences, no explanations, no bullet labels like "Here is your prompt".
- The text must be ready to paste directly into a "System Prompt" configuration field.
- Keep the prompt concise, role-specific, and actionable: clear boundaries, tone, key behaviors, and what the assistant should avoid or escalate.`;

const GENERATE_CODE_META = `You are an expert JavaScript engineer for a Flow Builder Code Execution sandbox.

Runtime environment (strict):
- Code runs inside an isolated VM with async/await support.
- Available globals: \`variables\` (plain object), \`fetch\` (returns { ok, status, statusText, text(), json() }), and no-op \`console\`.
- There is NO Node.js, DOM, require/import, filesystem, or process access.
- Prefer mutating \`variables.*\` to pass data downstream (e.g. \`variables.json_respuesta = {...}\`, \`variables.result = ...\`).
- Use try/catch for robust error handling; store user-facing errors on \`variables.error\` when appropriate.
- Keep code concise, readable, and production-ready.

Your task:
- When the user describes a goal, generate JavaScript that achieves it in this sandbox.
- On follow-up turns, refine the previously generated code based on feedback.
- If CURRENT CODE is provided and non-empty, treat the request as fix/refactor/improve that code unless the user clearly asks for a full rewrite from scratch.

Output rules (strict):
- Output ONLY JavaScript source code. No markdown fences, no preamble, no explanations, no comments like "Here is the code".
- Do not wrap the code in \`\`\`javascript blocks.
- The text must be ready to paste directly into the Code Execution editor.`;

async function resolveAssistApiKey(params: {
  companyId: number;
  provider: 'openai' | 'openrouter' | 'azure';
  credentialSource: 'auto' | 'company' | 'system' | 'manual';
  manualApiKey?: string;
  manualApiKeyAlias?: string;
  azureEndpoint?: string;
  azureApiVersion?: string;
}): Promise<{
  apiKey?: string;
  error?: string;
  status?: number;
  azureEndpoint?: string;
  azureApiVersion?: string;
  defaultChatDeployment?: string;
}> {
  const { companyId, provider, credentialSource, manualApiKey, manualApiKeyAlias, azureEndpoint, azureApiVersion } = params;

  if (credentialSource === 'manual') {
    const resolvedManualKey = manualApiKey?.trim() || manualApiKeyAlias?.trim();
    if (!resolvedManualKey) {
      return {
        status: 400,
        error: 'Manual API key is required when credential source is manual',
      };
    }
    if (provider === 'azure' && !azureEndpoint?.trim()) {
      return {
        status: 400,
        error: 'Azure endpoint is required when using a manual Azure key',
      };
    }
    return {
      apiKey: resolvedManualKey,
      azureEndpoint,
      azureApiVersion,
    };
  }

  const credential = await aiCredentialsService.getCredentialWithPreference(
    companyId,
    provider,
    credentialSource
  );
  if (!credential?.apiKey) {
    return {
      status: 400,
      error: 'No valid API credentials found for the selected provider and credential source',
    };
  }
  const azure = azureConnectionFromCredentialSource(credential);
  return {
    apiKey: credential.apiKey,
    azureEndpoint: azure?.endpoint,
    azureApiVersion: azure?.apiVersion,
    defaultChatDeployment: azure?.defaultChatDeployment,
  };
}

function createAssistOpenAIClient(
  provider: 'openai' | 'openrouter' | 'azure',
  apiKey: string,
  azure?: { endpoint?: string; apiVersion?: string; defaultChatDeployment?: string }
) {
  if (provider === 'openrouter') {
    return new OpenAI({
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://bothive.pro',
        'X-Title': 'BotHive',
      },
    });
  }
  if (provider === 'azure') {
    if (!azure?.endpoint) {
      throw new Error('Azure endpoint is required');
    }
    return createAzureOpenAIRestClient({
      apiKey,
      endpoint: azure.endpoint,
      apiVersion: azure.apiVersion || '2024-10-21',
      defaultChatDeployment: azure.defaultChatDeployment,
    }, azure.defaultChatDeployment);
  }
  return new OpenAI({ apiKey });
}

/** Models like gpt-5.3-codex reject chat/completions and require the Responses API. */
function requiresResponsesApi(provider: string, model: string): boolean {
  if (provider !== 'openai') return false;
  const m = (model || '').toLowerCase();
  return (
    m.includes('codex') ||
    m.startsWith('gpt-5.3') ||
    m.startsWith('gpt-5.4') ||
    m.startsWith('gpt-5.5') ||
    m.startsWith('gpt-5.6')
  );
}

function stripMarkdownCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:javascript|js)?\s*([\s\S]*?)```$/i);
  return fenced?.[1] ? fenced[1].trim() : trimmed;
}

async function generateAssistCompletion(params: {
  client: OpenAI;
  provider: 'openai' | 'openrouter' | 'azure';
  model: string;
  system: string;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  userMessage: string;
  maxTokens: number;
  temperature?: number;
}): Promise<string> {
  const {
    client,
    provider,
    model,
    system,
    conversationHistory,
    userMessage,
    maxTokens,
    temperature = 0.7,
  } = params;

  if (requiresResponsesApi(provider, model)) {
    const response = await client.responses.create({
      model,
      instructions: system,
      input: [
        ...conversationHistory.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        { role: 'user' as const, content: userMessage },
      ],
      max_output_tokens: maxTokens,
    });
    const text = typeof response.output_text === 'string' ? response.output_text : '';
    return text.trim();
  }

  const modernParameters = usesModernChatCompletionParameters(model);
  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: system },
      ...conversationHistory.map(
        (m): OpenAI.Chat.ChatCompletionUserMessageParam | OpenAI.Chat.ChatCompletionAssistantMessageParam => ({
          role: m.role,
          content: m.content,
        })
      ),
      { role: 'user', content: userMessage },
    ],
    ...(modernParameters
      ? { max_completion_tokens: maxTokens }
      : { max_tokens: maxTokens, temperature }),
  });

  const content = response.choices[0]?.message?.content ?? '';
  return typeof content === 'string' ? content.trim() : '';
}

/**
 * POST /api/ai-assist/generate-system-prompt
 * Generate or refine an AI assistant system prompt from business description / follow-ups
 */
router.post('/generate-system-prompt', ensureAuthenticated, async (req, res) => {
  try {
    const validatedData = generateSystemPromptSchema.parse(req.body);

    if (!req.user?.companyId) {
      return res.status(400).json({
        success: false,
        error: 'Company ID is required'
      });
    }

    const companyId = req.user.companyId;
    const {
      provider,
      credentialSource,
      model,
      message,
      conversationHistory,
      manualApiKey,
      apiKey: manualApiKeyAlias,
      azureEndpoint,
      azureApiVersion,
    } = validatedData;

    const resolved = await resolveAssistApiKey({
      companyId,
      provider,
      credentialSource,
      manualApiKey,
      manualApiKeyAlias,
      azureEndpoint,
      azureApiVersion,
    });
    if (!resolved.apiKey) {
      return res.status(resolved.status || 400).json({
        success: false,
        error: resolved.error || 'Failed to resolve API credentials',
      });
    }

    const client = createAssistOpenAIClient(provider, resolved.apiKey, {
      endpoint: resolved.azureEndpoint,
      apiVersion: resolved.azureApiVersion,
      defaultChatDeployment: resolved.defaultChatDeployment,
    });

    const defaultModel =
      provider === 'openrouter'
        ? 'openai/gpt-4.1-mini'
        : provider === 'azure'
          ? (resolved.defaultChatDeployment || model || '')
          : 'gpt-4.1-mini';
    const resolvedModel = model || defaultModel;

    logger.info('AIAssist', `Generate system prompt request from user ${req.user.id}`, {
      companyId,
      provider,
      credentialSource,
      model: resolvedModel,
      useResponsesApi: requiresResponsesApi(provider, resolvedModel),
      historyLength: conversationHistory.length,
      messageLength: message.length
    });

    const trimmed = await generateAssistCompletion({
      client,
      provider,
      model: resolvedModel,
      system: GENERATE_SYSTEM_PROMPT_META,
      conversationHistory,
      userMessage: message,
      maxTokens: 1500,
      temperature: 0.7,
    });

    res.json({
      success: true,
      message: trimmed
    });
  } catch (error) {
    logger.error('AIAssist', 'Error in generate-system-prompt endpoint', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.errors
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to generate system prompt',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/** Improve an existing AI Assistant system prompt without opening the prompt-generation chat. */
router.post('/enhance-system-prompt', ensureAuthenticated, async (req, res) => {
  try {
    const validatedData = enhanceSystemPromptSchema.parse(req.body);
    if (!req.user?.companyId) {
      return res.status(400).json({ success: false, error: 'Company ID is required' });
    }

    const {
      prompt,
      provider,
      credentialSource,
      model,
      manualApiKey,
      apiKey: manualApiKeyAlias,
      azureEndpoint,
      azureApiVersion,
    } = validatedData;
    const resolved = await resolveAssistApiKey({
      companyId: req.user.companyId,
      provider,
      credentialSource,
      manualApiKey,
      manualApiKeyAlias,
      azureEndpoint,
      azureApiVersion,
    });
    if (!resolved.apiKey) {
      return res.status(resolved.status || 400).json({
        success: false,
        code: 'NO_AI_CREDENTIALS',
        error: resolved.error || 'Failed to resolve API credentials',
      });
    }

    const client = createAssistOpenAIClient(provider, resolved.apiKey, {
      endpoint: resolved.azureEndpoint,
      apiVersion: resolved.azureApiVersion,
      defaultChatDeployment: resolved.defaultChatDeployment,
    });
    const resolvedModel = model || (provider === 'openrouter'
      ? 'openai/gpt-4.1-mini'
      : provider === 'azure'
        ? (resolved.defaultChatDeployment || '')
        : 'gpt-4.1-mini');
    const generated = await generateAssistCompletion({
      client,
      provider,
      model: resolvedModel,
      system: ENHANCE_SYSTEM_PROMPT_META,
      conversationHistory: [],
      userMessage: `EXISTING SYSTEM PROMPT:\n${prompt}`,
      maxTokens: 3000,
      temperature: 0.2,
    });
    return res.json({ success: true, message: normalizeEnhancedSystemPrompt(prompt, redactCreatorText(generated)) });
  } catch (error) {
    logger.error('AIAssist', 'Error enhancing system prompt', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, code: 'INVALID_REQUEST', error: 'Invalid request data', details: error.errors });
    }
    return res.status(500).json({
      success: false,
      code: 'ENHANCEMENT_FAILED',
      error: 'Failed to enhance system prompt',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/ai-assist/generate-code
 * Generate or refine Flow Builder sandbox JavaScript from a natural-language request
 */
router.post('/generate-code', ensureAuthenticated, async (req, res) => {
  try {
    const validatedData = generateCodeSchema.parse(req.body);

    if (!req.user?.companyId) {
      return res.status(400).json({
        success: false,
        error: 'Company ID is required',
      });
    }

    const companyId = req.user.companyId;
    const {
      provider,
      credentialSource,
      model,
      message,
      conversationHistory,
      currentCode,
      manualApiKey,
      apiKey: manualApiKeyAlias,
      azureEndpoint,
      azureApiVersion,
    } = validatedData;

    const resolved = await resolveAssistApiKey({
      companyId,
      provider,
      credentialSource,
      manualApiKey,
      manualApiKeyAlias,
      azureEndpoint,
      azureApiVersion,
    });
    if (!resolved.apiKey) {
      return res.status(resolved.status || 400).json({
        success: false,
        error: resolved.error || 'Failed to resolve API credentials',
      });
    }

    const client = createAssistOpenAIClient(provider, resolved.apiKey, {
      endpoint: resolved.azureEndpoint,
      apiVersion: resolved.azureApiVersion,
      defaultChatDeployment: resolved.defaultChatDeployment,
    });
    const defaultModel =
      provider === 'openrouter'
        ? 'openai/gpt-4.1-mini'
        : provider === 'azure'
          ? (resolved.defaultChatDeployment || model || '')
          : 'gpt-4.1-mini';
    const resolvedModel = model || defaultModel;

    const currentCodeBlock =
      typeof currentCode === 'string' && currentCode.trim().length > 0
        ? `\n\nCURRENT CODE (editor contents):\n${currentCode}`
        : '\n\nCURRENT CODE: (empty)';

    logger.info('AIAssist', `Generate code request from user ${req.user.id}`, {
      companyId,
      provider,
      credentialSource,
      model: resolvedModel,
      useResponsesApi: requiresResponsesApi(provider, resolvedModel),
      historyLength: conversationHistory.length,
      messageLength: message.length,
      currentCodeLength: typeof currentCode === 'string' ? currentCode.length : 0,
    });

    const generatedText = await generateAssistCompletion({
      client,
      provider,
      model: resolvedModel,
      system: GENERATE_CODE_META,
      conversationHistory,
      userMessage: `${message}${currentCodeBlock}`,
      maxTokens: 4000,
      temperature: 0.3,
    });

    res.json({
      success: true,
      message: stripMarkdownCodeFence(generatedText),
    });
  } catch (error) {
    logger.error('AIAssist', 'Error in generate-code endpoint', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.errors,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to generate code',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.post('/improve', ensureAuthenticated, async (req, res) => {
  const parsed = assistRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'INVALID_REQUEST', details: parsed.error.errors });
  }

  const companyId = (req.user as any)?.companyId;
  if (!companyId) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  const controller = new AbortController();
  req.on('close', () => controller.abort());

  try {
    const result = await aiTextAssistService.streamAssist({
      ...parsed.data,
      companyId,
      signal: controller.signal,
      onDelta: (delta) => {
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ delta })}\n\n`);
        }
      },
    });

    if (!res.writableEnded) {
      res.write(
        `event: done\ndata: ${JSON.stringify({ usage: result.usage, provider: result.provider, model: result.model })}\n\n`,
      );
      res.end();
    }
  } catch (err: unknown) {
    logger.error('AiTextAssist', 'stream failed', err);

    if (err instanceof Error && err.message === 'NO_AI_CREDENTIALS') {
      if (!res.writableEnded) {
        res.write('event: error\ndata: {"code":"NO_AI_CREDENTIALS"}\n\n');
        res.end();
      }
      return;
    }

    if (
      (err instanceof Error && err.name === 'APIUserAbortError') ||
      controller.signal.aborted
    ) {
      if (!res.writableEnded) {
        res.end();
      }
      return;
    }

    if (!res.writableEnded) {
      res.write(
        `event: error\ndata: ${JSON.stringify({
          code: 'INTERNAL',
          message: 'An unexpected error occurred. Please try again.',
        })}\n\n`,
      );
      res.end();
    }
  }
});

export default router;
