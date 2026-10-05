import { apiRequest } from '@/lib/queryClient';

export interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  pricing?: {
    prompt: string;
    completion: string;
  };
  context_length?: number;
  architecture?: {
    modality?: string;
    input_modalities?: string[];
    output_modalities?: string[];
    tokenizer?: string;
    instruct_type?: string;
  };
  top_provider?: {
    max_completion_tokens?: number;
    is_moderated?: boolean;
  };
  per_request_limits?: {
    prompt_tokens?: string;
    completion_tokens?: string;
  };
}

export interface OpenRouterModelsResponse {
  data: OpenRouterModel[];
}

export interface ProcessedModel {
  id: string;
  name: string;
  description?: string;
  contextLength?: number;
  pricing?: {
    input: number;
    output: number;
  };
  supportsTools?: boolean;
  supportsImage?: boolean;
  architecture?: {
    modality?: string;
    inputModalities?: string[];
    outputModalities?: string[];
  };
}



/** OpenRouter model IDs that support tool/function calling (valid model IDs only) */
const FUNCTION_CALLING_SUPPORTED_MODELS = new Set([
  'openai/gpt-5.6-sol',
  'openai/gpt-5.6-terra',
  'openai/gpt-5.6-luna',
  'google/gemini-2.5-flash-lite',
  'google/gemini-2.5-flash',
  'google/gemini-2.5-pro',
  'google/gemini-2.0-flash-001',
  'openai/gpt-5.1',
  'openai/gpt-5-chat',
  'openai/gpt-4.1-mini',
  'openai/gpt-4.1-nano',
  'openai/gpt-3.5-turbo',
  'qwen/qwen3-32b',
  'deepseek/deepseek-chat-v3.1',
  'x-ai/grok-4.1-fast',
  'x-ai/grok-4-fast',
  'x-ai/grok-4',
  'x-ai/grok-3-mini',
  'mistralai/mistral-nemo'
]);

/** Used when OpenRouter /api/openrouter/models fails; valid tool-capable models only */
const FALLBACK_MODELS: ProcessedModel[] = [
  { id: 'openai/gpt-5.6-sol', name: 'GPT-5.6 Sol (via OpenRouter)', supportsTools: true, supportsImage: true, architecture: { modality: 'text+image->text', inputModalities: ['text', 'image'], outputModalities: ['text'] } },
  { id: 'openai/gpt-5.6-terra', name: 'GPT-5.6 Terra (via OpenRouter)', supportsTools: true, supportsImage: true, architecture: { modality: 'text+image->text', inputModalities: ['text', 'image'], outputModalities: ['text'] } },
  { id: 'openai/gpt-5.6-luna', name: 'GPT-5.6 Luna (via OpenRouter)', supportsTools: true, supportsImage: true, architecture: { modality: 'text+image->text', inputModalities: ['text', 'image'], outputModalities: ['text'] } },
  { id: 'google/gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite (via OpenRouter)', supportsTools: true, supportsImage: true, architecture: { modality: 'text+image->text', inputModalities: ['text', 'image'], outputModalities: ['text'] } },
  { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash (via OpenRouter)', supportsTools: true, supportsImage: true, architecture: { modality: 'text+image->text', inputModalities: ['text', 'image'], outputModalities: ['text'] } },
  { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro (via OpenRouter)', supportsTools: true, supportsImage: true, architecture: { modality: 'text+image->text', inputModalities: ['text', 'image'], outputModalities: ['text'] } },
  { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash (via OpenRouter)', supportsTools: true, supportsImage: true, architecture: { modality: 'text+image->text', inputModalities: ['text', 'image'], outputModalities: ['text'] } },
  { id: 'openai/gpt-5.1', name: 'GPT-5.1 (via OpenRouter)', supportsTools: true, supportsImage: true, architecture: { modality: 'text+image->text', inputModalities: ['text', 'image'], outputModalities: ['text'] } },
  { id: 'openai/gpt-5-chat', name: 'GPT-5 Chat (via OpenRouter)', supportsTools: true, supportsImage: true, architecture: { modality: 'text+image->text', inputModalities: ['text', 'image'], outputModalities: ['text'] } },
  { id: 'openai/gpt-4.1-mini', name: 'GPT-4.1 Mini (via OpenRouter)', supportsTools: true, supportsImage: true, architecture: { modality: 'text+image->text', inputModalities: ['text', 'image'], outputModalities: ['text'] } },
  { id: 'openai/gpt-4.1-nano', name: 'GPT-4.1 Nano (via OpenRouter)', supportsTools: true, supportsImage: true, architecture: { modality: 'text+image->text', inputModalities: ['text', 'image'], outputModalities: ['text'] } },
  { id: 'openai/gpt-3.5-turbo', name: 'GPT-3.5 Turbo (via OpenRouter)', supportsTools: true, supportsImage: false, architecture: { modality: 'text->text', inputModalities: ['text'], outputModalities: ['text'] } },
  { id: 'qwen/qwen3-32b', name: 'Qwen3 32B (via OpenRouter)', supportsTools: true, supportsImage: false, architecture: { modality: 'text->text', inputModalities: ['text'], outputModalities: ['text'] } },
  { id: 'deepseek/deepseek-chat-v3.1', name: 'DeepSeek Chat v3.1 (via OpenRouter)', supportsTools: true, supportsImage: false, architecture: { modality: 'text->text', inputModalities: ['text'], outputModalities: ['text'] } },
  { id: 'x-ai/grok-4.1-fast', name: 'Grok 4.1 Fast (xAI)', supportsTools: true, supportsImage: true, architecture: { modality: 'text+image->text', inputModalities: ['text', 'image'], outputModalities: ['text'] } },
  { id: 'x-ai/grok-4-fast', name: 'Grok 4 Fast (xAI)', supportsTools: true, supportsImage: true, architecture: { modality: 'text+image->text', inputModalities: ['text', 'image'], outputModalities: ['text'] } },
  { id: 'x-ai/grok-4', name: 'Grok 4 (xAI)', supportsTools: true, supportsImage: true, architecture: { modality: 'text+image->text', inputModalities: ['text', 'image'], outputModalities: ['text'] } },
  { id: 'x-ai/grok-3-mini', name: 'Grok 3 Mini (xAI)', supportsTools: true, supportsImage: false, architecture: { modality: 'text->text', inputModalities: ['text'], outputModalities: ['text'] } },
  { id: 'mistralai/mistral-nemo', name: 'Mistral Nemo (via OpenRouter)', supportsTools: true, supportsImage: false, architecture: { modality: 'text->text', inputModalities: ['text'], outputModalities: ['text'] } }
];

const IMAGE_OUTPUT_KEYWORDS = ['image generation', 'text-to-image', 'image-to-image', 'diffusion', 'sdxl', 'dall-e'];
const TEXT_OUTPUT_KEYWORDS = ['text', 'chat', 'assistant', 'language', 'instruct'];


function getNormalizedModalities(model: OpenRouterModel): { inputs: string[]; outputs: string[] } {
  const inputs = (model.architecture?.input_modalities || [])
    .map((entry) => String(entry || '').toLowerCase().trim())
    .filter(Boolean);
  const outputs = (model.architecture?.output_modalities || [])
    .map((entry) => String(entry || '').toLowerCase().trim())
    .filter(Boolean);
  const modality = String(model.architecture?.modality || '').toLowerCase();

  if (inputs.length === 0 && modality.includes('image') && modality.includes('text')) {
    inputs.push('text', 'image');
  } else if (inputs.length === 0 && modality.includes('text')) {
    inputs.push('text');
  }
  if (outputs.length === 0 && modality.includes('->text')) {
    outputs.push('text');
  } else if (outputs.length === 0 && modality.includes('text')) {
    outputs.push('text');
  }

  return { inputs: Array.from(new Set(inputs)), outputs: Array.from(new Set(outputs)) };
}

function supportsImageInput(model: OpenRouterModel): boolean {
  const { inputs } = getNormalizedModalities(model);
  return inputs.includes('image');
}

function isTextOutputModel(model: OpenRouterModel): boolean {
  const modelName = model.name.toLowerCase();
  const modelId = model.id.toLowerCase();
  const description = (model.description || '').toLowerCase();
  const combined = `${modelName} ${modelId} ${description}`;
  const { outputs } = getNormalizedModalities(model);

  const hasTextOutput = outputs.includes('text') || TEXT_OUTPUT_KEYWORDS.some((keyword) => combined.includes(keyword));
  if (!hasTextOutput) {
    return false;
  }
  const isLikelyImageOnly = IMAGE_OUTPUT_KEYWORDS.some((keyword) => combined.includes(keyword)) && !combined.includes('chat');
  if (isLikelyImageOnly) {
    return false;
  }
  return true;
}

/**
 * Process and format model name for display
 */
function formatModelName(model: OpenRouterModel): string {
  let name = model.name;
  

  if (name === model.id || name.length < 10) {
    const parts = model.id.split('/');
    if (parts.length === 2) {
      const [provider, modelName] = parts;
      name = `${modelName.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} (${provider})`;
    }
  }
  
  return name;
}

/**
 * Convert pricing strings to numbers (handles formats like "0.000001" or "$0.000001")
 */
function parsePricing(priceStr: string): number {
  if (!priceStr) return 0;
  const cleaned = priceStr.replace(/[$,]/g, '');
  return parseFloat(cleaned) || 0;
}

/**
 * Fetch available models from OpenRouter API
 */
export async function fetchOpenRouterModels(): Promise<ProcessedModel[]> {
  try {

    const response = await apiRequest('GET', '/api/openrouter/models');
    const data = await response.json() as OpenRouterModelsResponse;

    if (!data.data || !Array.isArray(data.data)) {
      console.warn('Invalid OpenRouter models response, using fallback');
      return FALLBACK_MODELS;
    }


    const textModels = data.data
      .filter((model: OpenRouterModel) => isTextOutputModel(model))
      .map((model: OpenRouterModel): ProcessedModel => ({
        ...model,
        id: model.id,
        name: formatModelName(model),
        description: model.description,
        contextLength: model.context_length,
        pricing: model.pricing ? {
          input: parsePricing(model.pricing.prompt),
          output: parsePricing(model.pricing.completion)
        } : undefined,
        supportsTools: FUNCTION_CALLING_SUPPORTED_MODELS.has(model.id),
        supportsImage: supportsImageInput(model),
        architecture: {
          modality: model.architecture?.modality,
          inputModalities: getNormalizedModalities(model).inputs,
          outputModalities: getNormalizedModalities(model).outputs
        }
      }))
      .sort((a: ProcessedModel, b: ProcessedModel) => {

        const aProvider = a.id.split('/')[0];
        const bProvider = b.id.split('/')[0];

        if (aProvider !== bProvider) {
          return aProvider.localeCompare(bProvider);
        }

        return a.name.localeCompare(b.name);
      });


    if (textModels.length === 0) {
      console.warn('No text models found in OpenRouter response, using fallback');
      return FALLBACK_MODELS;
    }

    const idsFromApi = new Set(textModels.map(m => m.id));
    const merged = [...textModels];
    for (const fallback of FALLBACK_MODELS) {
      if (!idsFromApi.has(fallback.id)) {
        merged.push(fallback);
        idsFromApi.add(fallback.id);
      }
    }
    merged.sort((a, b) => {
      const aProvider = a.id.split('/')[0];
      const bProvider = b.id.split('/')[0];
      if (aProvider !== bProvider) return aProvider.localeCompare(bProvider);
      return a.name.localeCompare(b.name);
    });

    return merged;
  } catch (error) {
    console.error('Failed to fetch OpenRouter models:', error);
    return FALLBACK_MODELS;
  }
}

/**
 * Get cached models or fetch fresh ones
 */
export function useOpenRouterModels() {
  const CACHE_KEY = 'openrouter-models';
  const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

  return {
    queryKey: [CACHE_KEY],
    queryFn: fetchOpenRouterModels,
    staleTime: CACHE_DURATION,
    cacheTime: CACHE_DURATION * 2, // Keep in cache for 2 hours
    retry: 2,
    retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000),
  };
}
