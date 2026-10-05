import { z } from 'zod';

export const AI_LLM_PROVIDERS = ['openai', 'openrouter', 'azure'] as const;
export type AiLlmProvider = (typeof AI_LLM_PROVIDERS)[number];

export const aiLlmProviderSchema = z.enum(AI_LLM_PROVIDERS);

export const DEFAULT_AZURE_OPENAI_API_VERSION = '2024-10-21';
export const DEFAULT_AZURE_CHAT_MODEL = 'gpt-5-mini';

/** Newer reasoning/GPT-5 chat models reject legacy max_tokens and fixed temperature values. */
export function usesModernChatCompletionParameters(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return /(^|[\/_\-.])(gpt-?5|o1|o3|o4)(?:[\/_\-.]|$)/.test(normalized);
}

export function pickPreferredAzureChatModel<T extends { id: string; underlyingModel?: string }>(
  models: T[],
  fallback = DEFAULT_AZURE_CHAT_MODEL
): string {
  const needle = DEFAULT_AZURE_CHAT_MODEL.toLowerCase();
  const exact = models.find((item) => item.id.toLowerCase() === needle);
  if (exact) return exact.id;
  const byUnderlying = models.find((item) => (item.underlyingModel || '').toLowerCase() === needle);
  if (byUnderlying) return byUnderlying.id;
  const fuzzy = models.find((item) =>
    item.id.toLowerCase().includes(needle) ||
    (item.underlyingModel || '').toLowerCase().includes(needle)
  );
  if (fuzzy) return fuzzy.id;
  return fallback;
}

export type AzureDeploymentKind = 'chat' | 'embedding' | 'other';

export type AzureCredentialMetadata = {
  endpoint: string;
  apiVersion: string;
  defaultChatDeployment?: string;
};

export type AzureConnectionConfig = {
  apiKey: string;
  endpoint: string;
  apiVersion: string;
  defaultChatDeployment?: string;
};

export type AzureDeploymentCatalogItem = {
  id: string;
  name: string;
  underlyingModel: string;
  kind: AzureDeploymentKind;
  supportsTools: boolean;
  supportsImage: boolean;
};

export const OPENAI_CHAT_MODEL_CAPABILITIES: Record<string, { supportsTools: boolean; supportsImage: boolean }> = {
  'gpt-5.6-sol': { supportsTools: true, supportsImage: true },
  'gpt-5.6-terra': { supportsTools: true, supportsImage: true },
  'gpt-5.6-luna': { supportsTools: true, supportsImage: true },
  'gpt-5.3-codex': { supportsTools: true, supportsImage: true },
  'gpt-5.4': { supportsTools: true, supportsImage: true },
  'gpt-5.4-pro': { supportsTools: true, supportsImage: true },
  'gpt-5.1': { supportsTools: true, supportsImage: true },
  'gpt-5-chat': { supportsTools: true, supportsImage: true },
  'gpt-5-mini': { supportsTools: true, supportsImage: true },
  'gpt-4.1-mini': { supportsTools: true, supportsImage: true },
  'gpt-4.1-nano': { supportsTools: true, supportsImage: true },
  'gpt-4o': { supportsTools: true, supportsImage: true },
  'gpt-4o-mini': { supportsTools: true, supportsImage: true },
  'gpt-4-turbo': { supportsTools: true, supportsImage: true },
  'gpt-3.5-turbo': { supportsTools: true, supportsImage: false },
};

const EMBEDDING_MODEL_PATTERN = /text-embedding|embedding-ada|ada-002/i;
const NON_CHAT_MODEL_PATTERN = /whisper|tts|dall-?e|davinci-embed|babbage-embed|canary/i;
const LARGE_EMBEDDING_PATTERN = /text-embedding-3-large/i;
const COMPATIBLE_EMBEDDING_PATTERN = /text-embedding-3-(small|large)|text-embedding-ada-002/i;

export function isAiLlmProvider(value: unknown): value is AiLlmProvider {
  return typeof value === 'string' && (AI_LLM_PROVIDERS as readonly string[]).includes(value);
}

export function normalizeAiLlmProvider(value: unknown, fallback: AiLlmProvider = 'openai'): AiLlmProvider {
  return isAiLlmProvider(value) ? value : fallback;
}

export function isAzureAiFoundryHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host.endsWith('.services.ai.azure.com') || host.endsWith('.cognitiveservices.azure.com');
}

/**
 * Accept a resource name or full Azure OpenAI / Foundry endpoint.
 * Classic Azure OpenAI returns `https://{resource}.openai.azure.com`.
 * Foundry / AI Services returns `https://{resource}.services.ai.azure.com/openai/v1`.
 */
export function normalizeAzureEndpoint(input: string | null | undefined): string {
  const raw = (input ?? '').trim();
  if (!raw) {
    throw new Error('Azure OpenAI endpoint is required');
  }

  let candidate = raw.replace(/\/+$/, '');

  if (!/^https?:\/\//i.test(candidate)) {
    const resource = candidate
      .replace(/\.openai\.azure\.com$/i, '')
      .replace(/[^a-z0-9-]/gi, '');
    if (!resource) {
      throw new Error('Azure OpenAI endpoint is invalid');
    }
    candidate = `https://${resource}.openai.azure.com`;
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error('Azure OpenAI endpoint is invalid');
  }

  if (url.protocol !== 'https:') {
    throw new Error('Azure OpenAI endpoint must use https');
  }

  const host = url.hostname.toLowerCase();
  if (isAzureAiFoundryHost(host)) {
    return `${url.protocol}//${url.host}/openai/v1`;
  }

  if (!host.endsWith('.openai.azure.com') && host !== 'openai.azure.com') {
    if (!host.includes('.')) {
      throw new Error('Azure OpenAI endpoint host is invalid');
    }
  }

  return `${url.protocol}//${url.host}`;
}

/** Classic Azure OpenAI lists deployments; Foundry v1 lists models on the OpenAI-compatible base. */
export function azureDeploymentsListUrl(endpoint: string, apiVersion?: string): string {
  const normalized = normalizeAzureEndpoint(endpoint);
  if (isAzureAiFoundryHost(new URL(normalized).hostname)) {
    return `${normalized}/models`;
  }
  const version = (apiVersion || DEFAULT_AZURE_OPENAI_API_VERSION).trim() || DEFAULT_AZURE_OPENAI_API_VERSION;
  return `${normalized}/openai/deployments?api-version=${encodeURIComponent(version)}`;
}

export function azureResourceNameFromEndpoint(endpoint: string): string {
  const normalized = normalizeAzureEndpoint(endpoint);
  const host = new URL(normalized).hostname;
  const suffix = '.openai.azure.com';
  if (host.toLowerCase().endsWith(suffix)) {
    return host.slice(0, -suffix.length);
  }
  return host.split('.')[0] || host;
}

export function parseAzureCredentialMetadata(metadata: unknown): AzureCredentialMetadata | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  const record = metadata as Record<string, unknown>;
  const endpointRaw = typeof record.endpoint === 'string' ? record.endpoint : '';
  if (!endpointRaw.trim()) {
    return null;
  }
  try {
    const endpoint = normalizeAzureEndpoint(endpointRaw);
    const apiVersion =
      typeof record.apiVersion === 'string' && record.apiVersion.trim()
        ? record.apiVersion.trim()
        : DEFAULT_AZURE_OPENAI_API_VERSION;
    const defaultChatDeployment =
      typeof record.defaultChatDeployment === 'string' && record.defaultChatDeployment.trim()
        ? record.defaultChatDeployment.trim()
        : undefined;
    return { endpoint, apiVersion, defaultChatDeployment };
  } catch {
    return null;
  }
}

export function buildAzureCredentialMetadata(input: {
  endpoint: string;
  apiVersion?: string;
  defaultChatDeployment?: string | null;
}): AzureCredentialMetadata {
  const endpoint = normalizeAzureEndpoint(input.endpoint);
  const apiVersion = (input.apiVersion || DEFAULT_AZURE_OPENAI_API_VERSION).trim() || DEFAULT_AZURE_OPENAI_API_VERSION;
  const defaultChatDeployment = input.defaultChatDeployment?.trim() || undefined;
  return defaultChatDeployment
    ? { endpoint, apiVersion, defaultChatDeployment }
    : { endpoint, apiVersion };
}

export function classifyAzureDeployment(underlyingModel: string, deploymentName?: string): AzureDeploymentKind {
  const haystack = `${underlyingModel} ${deploymentName ?? ''}`;
  if (EMBEDDING_MODEL_PATTERN.test(haystack)) {
    return 'embedding';
  }
  if (NON_CHAT_MODEL_PATTERN.test(haystack)) {
    return 'other';
  }
  return 'chat';
}

export function getOpenAiModelCapabilities(modelId: string): { supportsTools: boolean; supportsImage: boolean } | undefined {
  const exact = OPENAI_CHAT_MODEL_CAPABILITIES[modelId];
  if (exact) return exact;
  const lower = modelId.toLowerCase();
  const match = Object.entries(OPENAI_CHAT_MODEL_CAPABILITIES).find(([id]) => lower.includes(id));
  return match?.[1];
}

/** Preserve explicit OpenAI model IDs; only fall back when no model was supplied. */
export function resolveOpenAiChatModelId(modelId: string | null | undefined): string {
  return modelId?.trim() || 'gpt-5.6-luna';
}

/**
 * Resolve image-input support for models exposed by the Workflow Creator.
 * Dynamic OpenRouter/Azure catalogs remain authoritative in the UI; this helper
 * provides the server-side safety check and deterministic fallback behavior.
 */
export function aiCreatorModelSupportsImage(provider: AiLlmProvider, modelId: string): boolean {
  const normalized = modelId.trim();
  if (!normalized) return false;
  if (provider === 'azure') return azureChatCapabilities(normalized).supportsImage;
  if (provider === 'openrouter') {
    const openAiModel = normalized.startsWith('openai/') ? normalized.slice('openai/'.length) : normalized;
    const known = getOpenAiModelCapabilities(openAiModel);
    if (known) return known.supportsImage;
    return /(?:gemini|claude|gpt-4o|gpt-4\.1|gpt-5|grok-4|vision|vl)/i.test(normalized);
  }
  return getOpenAiModelCapabilities(normalized)?.supportsImage ?? /(?:gpt-4o|gpt-4\.1|gpt-5|vision)/i.test(normalized);
}

export function aiCreatorVisionFallback(provider: Exclude<AiLlmProvider, 'azure'>): string {
  return provider === 'openrouter' ? 'openai/gpt-5.6-sol' : 'gpt-5.6-sol';
}

export function uniqueAzureDeploymentCatalog(
  items: AzureDeploymentCatalogItem[]
): AzureDeploymentCatalogItem[] {
  const seen = new Set<string>();
  const unique: AzureDeploymentCatalogItem[] = [];
  for (const item of items) {
    if (!item.id || seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
  }
  return unique;
}

/**
 * Foundry catalog models (Phi, Llama, JAIS, Mistral, Claude, …) typically run on vLLM
 * and reject OpenAI `tool_choice=auto`. Only native Azure OpenAI GPT / o-series / Codex
 * families should advertise function calling.
 */
export function azureModelSupportsOpenAiTools(modelId: string): boolean {
  const id = (modelId || '').trim();
  if (!id) return false;
  const known = getOpenAiModelCapabilities(id);
  if (known) return known.supportsTools;
  return /(?:^|[^a-z0-9])(gpt|o1|o3|o4|codex)(?:[^a-z0-9]|$)/i.test(id);
}

export function azureChatCapabilities(underlyingModel: string): { supportsTools: boolean; supportsImage: boolean } {
  const known = getOpenAiModelCapabilities(underlyingModel);
  if (known) return known;
  const supportsTools = azureModelSupportsOpenAiTools(underlyingModel);
  return {
    supportsTools,
    supportsImage: /vision|image/i.test(underlyingModel) || supportsTools,
  };
}

export function isCompatibleAzureEmbeddingModel(underlyingModel: string): boolean {
  return COMPATIBLE_EMBEDDING_PATTERN.test(underlyingModel);
}

export function azureEmbeddingNeedsDimensions(underlyingModel: string): boolean {
  return LARGE_EMBEDDING_PATTERN.test(underlyingModel);
}

export function toAzureDeploymentCatalogItem(input: {
  id: string;
  model?: string;
  name?: string;
}): AzureDeploymentCatalogItem {
  const underlyingModel = (input.model || input.id || '').trim();
  const id = (input.id || '').trim();
  const kind = classifyAzureDeployment(underlyingModel, id);
  const capabilities = kind === 'chat'
    ? azureChatCapabilities(underlyingModel)
    : { supportsTools: false, supportsImage: false };
  return {
    id,
    name: input.name?.trim() || id,
    underlyingModel,
    kind,
    supportsTools: capabilities.supportsTools,
    supportsImage: capabilities.supportsImage,
  };
}

export const azureConnectionFieldsSchema = z.object({
  endpoint: z.string().min(1, 'Azure endpoint is required'),
  apiVersion: z.string().optional(),
  defaultChatDeployment: z.string().optional(),
});

export function requireAzureEndpointWhenProviderAzure<
  T extends { provider?: string; endpoint?: string | null }
>(data: T, ctx: z.RefinementCtx): void {
  if (data.provider === 'azure' && !String(data.endpoint ?? '').trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endpoint'],
      message: 'Azure endpoint is required',
    });
  }
}
