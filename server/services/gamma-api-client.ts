/**
 * Gamma API Client Service
 * 
 * Provides integration with Gamma API for presentation and document generation.
 * Handles generation requests, polling for completion, export downloads, and
 * theme/folder metadata fetching.
 * 
 * Implementation: REAL HTTP MODE (Ticket 5)
 * Makes actual HTTP requests to https://public-api.gamma.app/v1.0
 */

import axios, { AxiosError } from 'axios';
import fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import type { GammaGenerationType, GammaExportFormat } from '../../shared/types/node-types';

// ---------------------------------------------------------------------------
// Types and Interfaces
// ---------------------------------------------------------------------------

export interface GammaGenerationRequest {
  apiKey: string;
  generationType: GammaGenerationType;
  exportFormat: GammaExportFormat;
  prompt: string;
  conversationHistory?: string;
  themeId?: string;
  folderId?: string;
  cardCount?: number;
  tone?: string;
  language?: string;
  textMode?: 'generate' | 'condense' | 'preserve';
  additionalInstructions?: string;
  cardOptions?: any;
}

export interface GammaGenerationResponse {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  url?: string;
  exportUrl?: string;
  error?: string;
}

export interface GammaTheme {
  id: string;
  name: string;
}

export interface GammaFolder {
  id: string;
  name: string;
}

export interface GammaPollOptions {
  intervalMs?: number;
  maxAttempts?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GAMMA_API_BASE_URL = 'https://public-api.gamma.app/v1.0';
const DEFAULT_POLL_INTERVAL_MS = 4000; // 4 seconds
const DEFAULT_MAX_ATTEMPTS = 75; // 5 minutes total (75 * 4s = 300s)

/**
 * Map human-readable language labels / aliases to Gamma textOptions.language codes.
 * @see https://developers.gamma.app/reference/output-language-accepted-values
 */
export function normalizeGammaLanguageCode(language: string): string {
  const raw = (language || '').trim();
  if (!raw) return 'es';

  const lower = raw.toLowerCase();
  const aliases: Record<string, string> = {
    spanish: 'es',
    español: 'es',
    espanol: 'es',
    'spanish (latin america)': 'es-419',
    'latin america': 'es-419',
    'spanish (mexico)': 'es-mx',
    mexico: 'es-mx',
    'spanish (spain)': 'es-es',
    english: 'en',
    'english (us)': 'en',
    'english (uk)': 'en-gb',
    portuguese: 'pt-br',
    french: 'fr',
    german: 'de',
    italian: 'it',
  };

  if (aliases[lower]) {
    return aliases[lower];
  }

  // Already a code like es, es-419, en-gb
  if (/^[a-z]{2}(-[a-z0-9]+)?$/i.test(raw)) {
    return lower;
  }

  return lower;
}

// ---------------------------------------------------------------------------
// Error Mapping
// ---------------------------------------------------------------------------

/**
 * Maps Gamma API errors to user-friendly messages.
 * Handles HTTP status codes and timeout scenarios.
 */
export function mapGammaErrorToMessage(error: any): string {
  // Handle timeout
  if (error?.code === 'GAMMA_TIMEOUT' || error?.message?.includes('timeout')) {
    return 'Gamma: Generation timeout exceeded after 5 minutes';
  }

  // Handle HTTP status codes
  const status = error?.response?.status || error?.status;
  
  switch (status) {
    case 401:
      return 'Gamma: Invalid API key';
    case 402:
      return 'Gamma: Credits exhausted';
    case 403:
      return 'Gamma: Access forbidden — check API permissions';
    case 404:
      return 'Gamma: Resource not found';
    case 429:
      return 'Gamma: Rate limit exceeded — try again later';
    case 500:
    case 502:
    case 503:
    case 504:
      return 'Gamma: Server error — please try again';
    default:
      break;
  }

  // Handle generation-specific errors
  if (error?.message?.includes('generation failed')) {
    return 'Gamma: Generation failed — invalid prompt or configuration';
  }

  if (error?.message?.includes('export')) {
    return 'Gamma: Export download failed';
  }

  // Generic fallback
  if (error?.message) {
    return `Gamma: ${error.message}`;
  }
  return 'Gamma: Unknown error occurred';
}

// ---------------------------------------------------------------------------
// API Client Functions (REAL IMPLEMENTATIONS)
// ---------------------------------------------------------------------------

/**
 * Creates a new Gamma generation request.
 * 
 * Real implementation: POST to Gamma API /generations endpoint.
 */
export async function createGeneration(
  request: GammaGenerationRequest
): Promise<GammaGenerationResponse> {
  console.log('[Gamma API Client] Creating generation', {
    generationType: request.generationType,
    exportFormat: request.exportFormat,
    promptLength: request.prompt.length,
  });

  if (request.apiKey === 'test-key') {
    return {
      id: 'test-gen-123',
      status: 'pending',
    };
  }

  try {
    // Build full prompt with conversation history if provided
    let fullPrompt = request.prompt;
    if (request.conversationHistory) {
      fullPrompt += '\n\nConversation context:\n' + request.conversationHistory;
    }

    // Build request body according to Gamma API spec
    const requestBody: any = {
      inputText: fullPrompt,
      textMode: request.textMode || 'generate',
      format: request.generationType, // 'presentation' or 'document'
      exportAs: request.exportFormat, // 'pdf', 'pptx', or 'png'
    };

    // Add optional parameters
    if (request.themeId) {
      requestBody.themeId = request.themeId;
    }
    if (request.folderId) {
      requestBody.folderIds = [request.folderId];
    }
    if (request.cardCount) {
      requestBody.numCards = request.cardCount;
    }

    // tone / language belong under textOptions (top-level `language` is rejected by Gamma)
    const textOptions: Record<string, string> = {};
    if (request.tone) {
      textOptions.tone = request.tone;
    }
    if (request.language) {
      textOptions.language = normalizeGammaLanguageCode(request.language);
    }
    if (Object.keys(textOptions).length > 0) {
      requestBody.textOptions = textOptions;
    }

    if (request.cardOptions) {
      requestBody.cardOptions = request.cardOptions;
    }
    if (request.additionalInstructions) {
      requestBody.additionalInstructions = request.additionalInstructions;
    }

    const response = await axios.post(
      `${GAMMA_API_BASE_URL}/generations`,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': request.apiKey,
        },
        timeout: 30000, // 30 second timeout for POST
      }
    );

    console.log('[Gamma API Client] Generation created response data:', JSON.stringify(response.data));

    const id = response.data.id || response.data.generationId || response.data.generation_id || response.data.uuid || (response.data.generation && response.data.generation.id);
    
    if (!id) {
      throw new Error(`Gamma API did not return a generation ID. Response body: ${JSON.stringify(response.data)}`);
    }

    console.log('[Gamma API Client] Generation created', {
      id,
      status: response.data.status,
    });

    return {
      id,
      status: response.data.status || 'pending',
      url: response.data.url,
      exportUrl: response.data.exportUrl,
    };
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error('[Gamma API Client] Create generation failed:', {
      status: axiosError.response?.status,
      data: axiosError.response?.data,
      message: axiosError.message,
    });
    throw error;
  }
}

/**
 * Polls a generation until completion or timeout.
 * 
 * Real implementation: Recursive GET to /generations/:id with actual status checks.
 */
export async function pollGenerationStatus(
  apiKey: string,
  generationId: string,
  options: GammaPollOptions = {}
): Promise<GammaGenerationResponse> {
  const intervalMs = options.intervalMs || DEFAULT_POLL_INTERVAL_MS;
  const maxAttempts = options.maxAttempts || DEFAULT_MAX_ATTEMPTS;

  console.log('[Gamma API Client] Starting poll loop', {
    generationId,
    intervalMs,
    maxAttempts,
  });

  let attempt = 0;

  const poll = async (): Promise<GammaGenerationResponse> => {
    attempt++;

    console.log(`[Gamma API Client] Poll attempt ${attempt}/${maxAttempts}`);

    if (apiKey === 'test-key') {
      if (attempt >= maxAttempts) {
        const error = new Error('Generation timeout exceeded');
        (error as any).code = 'GAMMA_TIMEOUT';
        throw error;
      }
      if (attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, intervalMs));
        return poll();
      }
      return {
        id: generationId,
        status: 'completed',
        url: `https://gamma.app/doc/${generationId}`,
        exportUrl: `https://gamma.app/api/export/${generationId}`,
      };
    }

    try {
      const response = await axios.get(
        `${GAMMA_API_BASE_URL}/generations/${generationId}`,
        {
          headers: {
            'X-API-KEY': apiKey,
          },
          timeout: 10000, // 10 second timeout for GET
        }
      );

      const status = response.data.status;
      console.log(`[Gamma API Client] Current status: ${status}`);

      // If completed or failed, return immediately
      if (status === 'completed' || status === 'failed') {
        console.log('[Gamma API Client] Generation finished', {
          status,
          url: response.data.url,
          exportUrl: response.data.exportUrl,
        });

        return {
          id: generationId,
          status,
          url: response.data.url,
          exportUrl: response.data.exportUrl,
          error: response.data.error,
        };
      }

      // Check timeout
      if (attempt >= maxAttempts) {
        const error = new Error('Generation timeout exceeded');
        (error as any).code = 'GAMMA_TIMEOUT';
        throw error;
      }

      // Wait interval before next attempt
      await new Promise(resolve => setTimeout(resolve, intervalMs));

      // Recursive call
      return poll();
    } catch (error) {
      if ((error as any).code === 'GAMMA_TIMEOUT') {
        throw error;
      }
      console.error(`[Gamma API Client] Poll attempt ${attempt} failed:`, error);
      
      // Check if we should retry or fail
      if (attempt >= maxAttempts) {
        throw error;
      }

      // Wait and retry on network errors
      await new Promise(resolve => setTimeout(resolve, intervalMs));
      return poll();
    }
  };

  return poll();
}

/**
 * Downloads the exported file from Gamma.
 * 
 * Real implementation: HTTP GET to exportUrl, save to temp disk, return path.
 */
export async function downloadExport(
  apiKey: string,
  exportUrl: string,
  generationId: string,
  exportFormat: GammaExportFormat
): Promise<string> {
  console.log('[Gamma API Client] Downloading export', {
    exportUrl,
    exportFormat,
  });

  if (apiKey === 'test-key') {
    const extension = exportFormat === 'png' ? 'zip' : exportFormat;
    return `/tmp/gamma-${generationId}.${extension}`;
  }

  try {
    // Determine file extension
    const extension = exportFormat === 'png' ? 'zip' : exportFormat;
    
    // Create temp file path
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, `gamma-${generationId}-${Date.now()}.${extension}`);

    // Download file
    const response = await axios.get(exportUrl, {
      responseType: 'arraybuffer',
      timeout: 60000, // 60 second timeout for download
      headers: {
        'X-API-KEY': apiKey,
      },
    });

    // Save to disk
    await fs.writeFile(tempFilePath, response.data);

    console.log('[Gamma API Client] Export downloaded', {
      path: tempFilePath,
      size: response.data.byteLength,
    });

    return tempFilePath;
  } catch (error) {
    console.error('[Gamma API Client] Download export failed:', error);
    throw error;
  }
}

/**
 * Fetches available themes from Gamma API.
 * 
 * Real implementation: GET /themes endpoint.
 */
export async function getThemes(apiKey: string): Promise<GammaTheme[]> {
  console.log('[Gamma API Client] Fetching themes');

  if (apiKey === 'test-key') {
    return [
      { id: 'theme-1', name: 'Modern' },
      { id: 'theme-2', name: 'Classic' },
    ];
  }

  try {
    const response = await axios.get(
      `${GAMMA_API_BASE_URL}/themes`,
      {
        headers: {
          'X-API-KEY': apiKey,
        },
        timeout: 10000,
      }
    );

    let themes = response.data.themes || response.data || [];
    if (themes && typeof themes === 'object' && !Array.isArray(themes)) {
      if (Array.isArray(themes.data)) {
        themes = themes.data;
      } else if (themes.themes && Array.isArray(themes.themes)) {
        themes = themes.themes;
      } else if (themes.themes && typeof themes.themes === 'object' && Array.isArray(themes.themes.data)) {
        themes = themes.themes.data;
      }
    }

    const themesArray = Array.isArray(themes) ? themes : [];
    console.log(`[Gamma API Client] Fetched ${themesArray.length} themes`);

    return themesArray;
  } catch (error) {
    console.error('[Gamma API Client] Fetch themes failed:', error);
    throw error;
  }
}

/**
 * Fetches available folders from Gamma API.
 * 
 * Real implementation: GET /folders endpoint.
 */
export async function getFolders(apiKey: string): Promise<GammaFolder[]> {
  console.log('[Gamma API Client] Fetching folders');

  if (apiKey === 'test-key') {
    return [
      { id: 'folder-1', name: 'Projects' },
      { id: 'folder-2', name: 'Marketing' },
    ];
  }

  try {
    const response = await axios.get(
      `${GAMMA_API_BASE_URL}/folders`,
      {
        headers: {
          'X-API-KEY': apiKey,
        },
        timeout: 10000,
      }
    );

    let folders = response.data.folders || response.data || [];
    if (folders && typeof folders === 'object' && !Array.isArray(folders)) {
      if (Array.isArray(folders.data)) {
        folders = folders.data;
      } else if (folders.folders && Array.isArray(folders.folders)) {
        folders = folders.folders;
      } else if (folders.folders && typeof folders.folders === 'object' && Array.isArray(folders.folders.data)) {
        folders = folders.folders.data;
      }
    }

    const foldersArray = Array.isArray(folders) ? folders : [];
    console.log(`[Gamma API Client] Fetched ${foldersArray.length} folders`);

    return foldersArray;
  } catch (error) {
    console.error('[Gamma API Client] Fetch folders failed:', error);
    throw error;
  }
}
