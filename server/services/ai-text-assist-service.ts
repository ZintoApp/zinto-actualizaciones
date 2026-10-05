import OpenAI from 'openai';
import { aiCredentialsService, azureConnectionFromCredentialSource } from './ai-credentials-service';
import { createAzureOpenAIRestClient } from './azure-openai';
import { logger } from '../utils/logger';

export type ToneVariant = 'formal' | 'empathetic' | 'apologetic' | 'persuasive' | 'enthusiastic';

export type AiAssistAction =
  | 'improve'
  | 'fix_grammar'
  | 'polite'
  | 'friendly'
  | 'shorten'
  | 'lengthen'
  | 'simplify'
  | 'tone'
  | 'translate'
  | 'continue'
  | 'summarize_reply'
  | 'custom';

export type RecentMessage = {
  role: 'agent' | 'contact';
  content: string;
  createdAt?: string;
};

export type StreamAssistOptions = {
  companyId: number;
  action: AiAssistAction;
  text: string;
  toneVariant?: ToneVariant;
  targetLanguage?: string;
  instruction?: string;
  recentMessages?: RecentMessage[];
  conversationId?: number | null;
  signal?: AbortSignal;
  onDelta: (delta: string) => void;
};

export type StreamAssistResult = {
  fullText: string;
  usage: { tokensInput: number; tokensOutput: number; tokensTotal: number };
  provider: string;
  model: string;
  credentialType: string;
};

const CONTEXT_AWARE_ACTIONS = new Set<AiAssistAction>(['continue']);

const DEFAULT_MODEL_BY_PROVIDER: Record<string, string> = {
  openai: 'gpt-4.1-mini',
  openrouter: 'openai/gpt-4.1-mini',
};

const MAX_OUTPUT_TOKENS = 1024;

const COMMON_PREAMBLE = [
  'Output only the rewritten text — no preamble, no explanation, no surrounding quotes, no markdown fencing.',
  'Preserve the original language verbatim except when translating (then output strictly in the target language).',
  'Preserve emojis, line breaks, mentions (e.g. @user), URLs, and template placeholders such as {{name}}, {{first_name}}, ${var} literally.',
  'Keep meaning intact; do not invent facts.',
].join(' ');

const PROMPTS: Record<AiAssistAction, (ctx: { toneVariant?: string; targetLanguage?: string; instruction?: string }) => string> = {
  improve: () => `${COMMON_PREAMBLE} Polish the writing for clarity, flow, and natural phrasing.`,
  fix_grammar: () => `${COMMON_PREAMBLE} Correct grammar, spelling, and punctuation only. Make minimal stylistic changes.`,
  polite: () => `${COMMON_PREAMBLE} Rewrite to sound more polite and professional, suitable for customer support.`,
  friendly: () => `${COMMON_PREAMBLE} Rewrite to sound more friendly, warm, and conversational without being unprofessional.`,
  shorten: () => `${COMMON_PREAMBLE} Rewrite to be significantly shorter while preserving all key information.`,
  lengthen: () => `${COMMON_PREAMBLE} Expand with helpful detail and clarification while staying on topic.`,
  simplify: () => `${COMMON_PREAMBLE} Rewrite using simpler vocabulary and shorter sentences for easy reading.`,
  tone: ({ toneVariant }) => `${COMMON_PREAMBLE} Apply a ${toneVariant} tone.`,
  translate: ({ targetLanguage }) =>
    `${COMMON_PREAMBLE} Translate the user's text into ${targetLanguage}. Output only the translation.`,
  continue: () =>
    `${COMMON_PREAMBLE} Continue the user's draft naturally where it leaves off. Output only the continuation, not the original text.`,
  summarize_reply: () =>
    `${COMMON_PREAMBLE} Read the conversation excerpt and draft the next reply from the agent. Reply in the same language as the latest contact message. If a draft is provided, build on it; otherwise compose from scratch.`,
  custom: ({ instruction }) => `${COMMON_PREAMBLE} Apply this instruction to the user's text: ${instruction}`,
};

export class AiTextAssistService {
  private resolveModel(provider: string, defaultChatDeployment?: string): string {
    if (provider === 'azure') {
      if (!defaultChatDeployment) {
        throw new Error('AZURE_DEFAULT_DEPLOYMENT_REQUIRED');
      }
      return defaultChatDeployment;
    }
    return DEFAULT_MODEL_BY_PROVIDER[provider] ?? 'gpt-4.1-mini';
  }

  private buildClient(
    provider: string,
    apiKey: string,
    azure?: { endpoint: string; apiVersion?: string; defaultChatDeployment?: string }
  ): OpenAI {
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
        throw new Error('NO_AI_CREDENTIALS');
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

  private formatRecentMessages(msgs: RecentMessage[]): string {
    const capped = msgs.slice(-10);
    return capped
      .map((m) => (m.role === 'contact' ? `Contact: ${m.content}` : `Agent: ${m.content}`))
      .join('\n');
  }

  private buildUserPayload(opts: StreamAssistOptions): string {
    if (opts.action === 'continue') {
      return opts.text;
    }
    if (opts.action === 'summarize_reply') {
      const formatted = this.formatRecentMessages(opts.recentMessages ?? []);
      const draft = opts.text || '(empty)';
      return `Conversation:\n${formatted}\n\nDraft so far: ${draft}`;
    }
    return opts.text;
  }

  private estimateTokens(s: string): number {
    return Math.ceil((s ?? '').length / 4);
  }

  async streamAssist(opts: StreamAssistOptions): Promise<StreamAssistResult> {
    const prefs = await aiCredentialsService.getCompanyPreferences(opts.companyId);
    const provider = (prefs?.defaultProvider || 'openai').toLowerCase();

    const credential = await aiCredentialsService.getCredentialForCompany(opts.companyId, provider);
    if (!credential) {
      throw new Error('NO_AI_CREDENTIALS');
    }

    const azure = azureConnectionFromCredentialSource(credential);
    const model = this.resolveModel(provider, azure?.defaultChatDeployment);
    const client = this.buildClient(provider, credential.apiKey, azure ?? undefined);

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: PROMPTS[opts.action]({
          toneVariant: opts.toneVariant,
          targetLanguage: opts.targetLanguage,
          instruction: opts.instruction,
        }),
      },
    ];

    if (CONTEXT_AWARE_ACTIONS.has(opts.action) && opts.recentMessages?.length) {
      messages.push({
        role: 'user',
        content: `Conversation excerpt:\n${this.formatRecentMessages(opts.recentMessages)}`,
      });
    }

    messages.push({
      role: 'user',
      content: this.buildUserPayload(opts),
    });

    const systemContent = messages.find((m) => m.role === 'system')?.content?.toString() ?? '';
    const userContent = messages
      .filter((m) => m.role !== 'system')
      .map((m) => (typeof m.content === 'string' ? m.content : ''))
      .join('\n');

    let fullText = '';
    let capturedUsage: OpenAI.Completions.CompletionUsage | undefined;

    try {
      const stream = await client.chat.completions.create(
        {
          model,
          stream: true,
          temperature: opts.action === 'fix_grammar' ? 0.2 : 0.7,
          max_tokens: MAX_OUTPUT_TOKENS,
          messages,
        },
        { signal: opts.signal },
      );

      for await (const chunk of stream) {
        if (opts.signal?.aborted) {
          break;
        }

        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          fullText += delta;
          opts.onDelta(delta);
        }

        if (chunk.usage) {
          capturedUsage = chunk.usage;
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'APIUserAbortError') {
        return {
          fullText,
          usage: {
            tokensInput: this.estimateTokens(systemContent + userContent),
            tokensOutput: this.estimateTokens(fullText),
            tokensTotal:
              this.estimateTokens(systemContent + userContent) + this.estimateTokens(fullText),
          },
          provider,
          model,
          credentialType: credential.type,
        };
      }
      throw err;
    }

    let tokensInput: number;
    let tokensOutput: number;
    let tokensTotal: number;

    if (capturedUsage) {
      tokensInput = capturedUsage.prompt_tokens ?? 0;
      tokensOutput = capturedUsage.completion_tokens ?? 0;
      tokensTotal = capturedUsage.total_tokens ?? tokensInput + tokensOutput;
    } else {
      tokensInput = this.estimateTokens(systemContent + userContent);
      tokensOutput = this.estimateTokens(fullText);
      tokensTotal = tokensInput + tokensOutput;
    }

    const usage = { tokensInput, tokensOutput, tokensTotal };

    try {
      await aiCredentialsService.trackUsageWithCost({
        companyId: opts.companyId,
        credentialType: credential.type,
        credentialId: credential.credential?.id ?? null,
        provider,
        model,
        tokensInput,
        tokensOutput,
        tokensTotal,
        requestCount: 1,
        conversationId: opts.conversationId ?? null,
        flowId: null,
        nodeId: 'ai-text-assist',
        usageDate: new Date().toISOString().split('T')[0],
      });
    } catch (err) {
      logger.error('AiTextAssist', 'usage tracking failed', err);
    }

    return { fullText, usage, provider, model, credentialType: credential.type };
  }
}

export const aiTextAssistService = new AiTextAssistService();
