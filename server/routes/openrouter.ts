import express from 'express';
import fetch from 'node-fetch';

const router = express.Router();

/**
 * Proxy endpoint for OpenRouter models API
 * This avoids CORS issues when calling OpenRouter directly from the frontend
 */
router.get('/models', async (req, res) => {
  try {

    const openRouterUrl = 'https://openrouter.ai/api/v1/models';
    

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://bothive.pro',
      'X-Title': 'BotHive'
    };


    const openRouterApiKey = process.env.OPENROUTER_API_KEY;
    if (openRouterApiKey) {
      headers['Authorization'] = `Bearer ${openRouterApiKey}`;
    }


    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(openRouterUrl, {
      method: 'GET',
      headers,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`OpenRouter API responded with status: ${response.status}`);
    }

    const data = await response.json();
    

    res.json(data);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('OpenRouter API request timed out');
    } else {
      console.error('Error fetching OpenRouter models:', error);
    }
    

    // Fallback when OpenRouter API is unavailable; tool-capable models so Flow Builder works offline
    const fallbackModels = {
      data: [
        { id: 'openai/gpt-5.6-sol', name: 'GPT-5.6 Sol', description: 'OpenAI flagship model', pricing: { prompt: '0.000004', completion: '0.00002' }, context_length: 1050000, architecture: { modality: 'text+image->text', input_modalities: ['text', 'image'], output_modalities: ['text'] } },
        { id: 'openai/gpt-5.6-terra', name: 'GPT-5.6 Terra', description: 'Balanced OpenAI model', pricing: { prompt: '0.000002', completion: '0.000012' }, context_length: 1050000, architecture: { modality: 'text+image->text', input_modalities: ['text', 'image'], output_modalities: ['text'] } },
        { id: 'openai/gpt-5.6-luna', name: 'GPT-5.6 Luna', description: 'Cost-efficient OpenAI model', pricing: { prompt: '0.0000002', completion: '0.0000012' }, context_length: 1050000, architecture: { modality: 'text+image->text', input_modalities: ['text', 'image'], output_modalities: ['text'] } },
        { id: 'openai/gpt-5.1', name: 'GPT-5.1', description: 'Premium OpenAI model', pricing: { prompt: '0.003', completion: '0.012' }, context_length: 128000, architecture: { modality: 'text+image->text', input_modalities: ['text', 'image'], output_modalities: ['text'] } },
        { id: 'openai/gpt-5-chat', name: 'GPT-5 Chat', description: 'Chat-optimized OpenAI model', pricing: { prompt: '0.0025', completion: '0.01' }, context_length: 128000, architecture: { modality: 'text+image->text', input_modalities: ['text', 'image'], output_modalities: ['text'] } },
        { id: 'openai/gpt-4.1-mini', name: 'GPT-4.1 Mini', description: 'Fast and efficient model', pricing: { prompt: '0.0002', completion: '0.0008' }, context_length: 128000, architecture: { modality: 'text+image->text', input_modalities: ['text', 'image'], output_modalities: ['text'] } },
        { id: 'openai/gpt-4.1-nano', name: 'GPT-4.1 Nano', description: 'Ultra-fast model', pricing: { prompt: '0.0001', completion: '0.0004' }, context_length: 128000, architecture: { modality: 'text+image->text', input_modalities: ['text', 'image'], output_modalities: ['text'] } },
        { id: 'openai/gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'Legacy model for compatibility', pricing: { prompt: '0.0005', completion: '0.0015' }, context_length: 16385, architecture: { modality: 'text->text', input_modalities: ['text'], output_modalities: ['text'] } },
        { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Google fast model with tool calling', pricing: { prompt: '0.000125', completion: '0.000375' }, context_length: 1000000, architecture: { modality: 'text+image->text', input_modalities: ['text', 'image'], output_modalities: ['text'] } },
        { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Google premium model', pricing: { prompt: '0.00125', completion: '0.005' }, context_length: 1000000, architecture: { modality: 'text+image->text', input_modalities: ['text', 'image'], output_modalities: ['text'] } },
        { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash', description: 'Google efficient model', pricing: { prompt: '0.0001', completion: '0.0003' }, context_length: 1000000, architecture: { modality: 'text+image->text', input_modalities: ['text', 'image'], output_modalities: ['text'] } },
        { id: 'deepseek/deepseek-chat-v3.1', name: 'DeepSeek Chat v3.1', description: 'DeepSeek chat model', pricing: { prompt: '0.00014', completion: '0.00028' }, context_length: 64000, architecture: { modality: 'text->text', input_modalities: ['text'], output_modalities: ['text'] } },
        { id: 'x-ai/grok-4', name: 'Grok 4', description: 'xAI flagship model', pricing: { prompt: '0.003', completion: '0.012' }, context_length: 128000, architecture: { modality: 'text+image->text', input_modalities: ['text', 'image'], output_modalities: ['text'] } },
        { id: 'x-ai/grok-4.1-fast', name: 'Grok 4.1 Fast', description: 'Fast xAI model', pricing: { prompt: '0.001', completion: '0.004' }, context_length: 128000, architecture: { modality: 'text+image->text', input_modalities: ['text', 'image'], output_modalities: ['text'] } },
        { id: 'mistralai/mistral-nemo', name: 'Mistral Nemo 12B', description: 'Mistral multilingual with function calling', pricing: { prompt: '0.0002', completion: '0.0002' }, context_length: 128000, architecture: { modality: 'text->text', input_modalities: ['text'], output_modalities: ['text'] } },
        { id: 'qwen/qwen3-32b', name: 'Qwen3 32B', description: 'Qwen model', pricing: { prompt: '0.0002', completion: '0.0002' }, context_length: 128000, architecture: { modality: 'text->text', input_modalities: ['text'], output_modalities: ['text'] } }
      ]
    };
    
    res.json(fallbackModels);
  }
});

export default router;
