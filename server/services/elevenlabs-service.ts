import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category: string;
  description?: string;
}

/**
 * Configuration for ElevenLabs text-to-speech API.
 *
 * v3 models (eleven_turbo_v2_5, eleven_flash_v2_5) support audio tags embedded
 * directly in the text content. These are special markers that modify voice
 * delivery and emotion. Common examples:
 * - [excited] - Adds excitement to the delivery
 * - [whispers] - Speaks in a whisper
 * - [laughs] - Adds laughter
 * - [sighs] - Adds a sigh
 * - [shouts] - Speaks loudly
 *
 * Audio tags are NOT separate API parameters - they are embedded in the text
 * itself. The promptInfluence and enableAudioTags config parameters are stored
 * for application-level logic and potential future use. The audioTagsInstructions
 * parameter will be integrated with the AI system prompt in subsequent phases
 * to instruct the AI model on when and how to use audio tags in its responses.
 *
 * @see https://elevenlabs.io/docs - ElevenLabs v3 best practices documentation
 */
interface ElevenLabsConfig {
  apiKey: string;
  voiceId?: string;
  model?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  useSpeakerBoost?: boolean;
  /** Controls how much the text prompt influences voice expression (0-1 range). Stored for application-level use. */
  promptInfluence?: number;
  /** Flag to indicate if audio tags should be used. Stored for application-level use. */
  enableAudioTags?: boolean;
  /** Custom instructions for audio tag usage. Will be integrated with AI system prompt in subsequent phases. */
  audioTagsInstructions?: string;
}

/**
 * Deprecated TTS model IDs per https://elevenlabs.io/docs/overview/models — replaced by eleven_multilingual_v2.
 * (There is no eleven_monolingual_v2; the official replacement for monolingual v1 is multilingual v2.)
 */
const DEPRECATED_TTS_MODEL_REPLACEMENTS: Record<string, string> = {
  eleven_monolingual_v1: 'eleven_multilingual_v2',
  eleven_multilingual_v1: 'eleven_multilingual_v2'
};

class ElevenLabsService {
  private baseUrl = 'https://api.elevenlabs.io/v1';

  /**
   * Check if the model ID is a v3 model (supports audio tags).
   * Mirrors the frontend implementation for consistency.
   */
  private isV3Model(modelId: string): boolean {
    return !!modelId && (
      modelId.includes('v3') ||
      modelId.includes('turbo_v2_5') ||
      modelId.includes('flash_v2_5')
    );
  }

  /**
   * Get available voices from ElevenLabs
   */
  async getVoices(apiKey: string): Promise<ElevenLabsVoice[]> {
    try {
      const response = await fetch(`${this.baseUrl}/voices`, {
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`ElevenLabs API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.voices || [];
    } catch (error) {
      console.error('ElevenLabs Service: Error fetching voices:', error);
      throw new Error(`Failed to fetch voices: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Convert text to speech using ElevenLabs API
   */
  async generateSpeech(text: string, config: ElevenLabsConfig): Promise<string> {
    try {
      if (!config.apiKey) {
        throw new Error('ElevenLabs API key is required');
      }

      if (!config.voiceId) {
        throw new Error('Voice ID is required for ElevenLabs TTS');
      }

      if (!text || text.trim().length === 0) {
        throw new Error('Text content is required for speech generation');
      }


      if (text.length > 5000) {
        
        text = text.substring(0, 5000) + '...';
      }


      let modelId = config.model || 'eleven_turbo_v2_5';
      const replacement = DEPRECATED_TTS_MODEL_REPLACEMENTS[modelId];
      if (replacement) {
        console.warn(
          `ElevenLabs: model "${modelId}" is deprecated; using "${replacement}". See https://elevenlabs.io/docs/overview/models`
        );
        modelId = replacement;
      }
      const isV3 = this.isV3Model(modelId);

      const requestBody: Record<string, unknown> = {
        text: text,
        model_id: modelId,
        voice_settings: {
          stability: config.stability ?? 0.5,
          similarity_boost: config.similarityBoost ?? 0.75,
          style: config.style ?? 0.0,
          use_speaker_boost: config.useSpeakerBoost ?? true
        }
      };

      if (isV3) {
        if (config.promptInfluence !== undefined) {
          // Clamp to 0-1 range for API compatibility; invalid values handled gracefully
          const clamped = Math.max(0, Math.min(1, Number(config.promptInfluence)));
          requestBody.prompt_influence = clamped;
        }
        if (config.enableAudioTags !== undefined) {
          requestBody.enable_audio_tags = config.enableAudioTags;
        }
        if (config.audioTagsInstructions !== undefined && config.audioTagsInstructions !== '') {
          requestBody.audio_tags_instructions = config.audioTagsInstructions;
        }
      }

      let response: Response;
      let lastError: Error | null = null;
      const maxRetries = 3;


      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          response = await fetch(`${this.baseUrl}/text-to-speech/${config.voiceId}`, {
            method: 'POST',
            headers: {
              'xi-api-key': config.apiKey,
              'Content-Type': 'application/json',
              'Accept': 'audio/mpeg'
            },
            body: JSON.stringify(requestBody)
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`ElevenLabs API error: ${response.status} ${response.statusText} - ${errorText}`);
          }

          break;
        } catch (error) {
          lastError = error as Error;

          if (attempt === maxRetries) {
            throw lastError;
          }


          const waitTime = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }


      const audioId = crypto.randomBytes(16).toString('hex');
      const audioDir = path.join(process.cwd(), 'public', 'media', 'audio');
      await fs.mkdir(audioDir, { recursive: true });


      const mp3FileName = `elevenlabs_tts_${audioId}.mp3`;
      const mp3Path = path.join(audioDir, mp3FileName);
      const audioBuffer = Buffer.from(await response!.arrayBuffer());
      await fs.writeFile(mp3Path, audioBuffer);


      try {
        const { convertAudioForCrossPlatform } = await import('../utils/audio-converter');
        const oggResult = await convertAudioForCrossPlatform(mp3Path, audioDir, mp3FileName);

        if (oggResult.success && oggResult.audioUrl) {

          return oggResult.audioUrl;
        } else {
          console.warn('ElevenLabs TTS: OGG conversion failed, using MP3 fallback:', oggResult.error);
        }
      } catch (conversionError) {
        console.warn('ElevenLabs TTS: Audio conversion not available, using MP3:', conversionError);
      }


      return `media/audio/${mp3FileName}`;
    } catch (error) {
      console.error('ElevenLabs Service: Error generating speech:', error);
      throw new Error(`ElevenLabs speech generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get default/popular voices for quick setup
   */
  getDefaultVoices(): ElevenLabsVoice[] {
    return [
      {
        voice_id: 'JaagUurP1dmW3WscoJ79', // Dahlia
        name: 'Dahlia',
        category: 'premade',
        description: 'ElevenLabs voice'
      },
      {
        voice_id: 'pNInz6obpgDQGcFmaJgB', // Adam
        name: 'Adam',
        category: 'premade',
        description: 'Deep, authoritative male voice'
      },
      {
        voice_id: 'EXAVITQu4vr4xnSDxMaL', // Bella
        name: 'Bella',
        category: 'premade',
        description: 'Warm, friendly female voice'
      },
      {
        voice_id: 'VR6AewLTigWG4xSOukaG', // Arnold
        name: 'Arnold',
        category: 'premade',
        description: 'Strong, confident male voice'
      },
      {
        voice_id: 'MF3mGyEYCl7XYWbV9V6O', // Elli
        name: 'Elli',
        category: 'premade',
        description: 'Young, energetic female voice'
      },
      {
        voice_id: 'TxGEqnHWrfWFTfGW9XjX', // Josh
        name: 'Josh',
        category: 'premade',
        description: 'Casual, conversational male voice'
      },
      {
        voice_id: 'jsCqWAovK2LkecY7zXl4', // Freya
        name: 'Freya',
        category: 'premade',
        description: 'Professional, clear female voice'
      }
    ];
  }

  /**
   * Validate API key by making a test request
   */
  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/user`, {
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json'
        }
      });

      return response.ok;
    } catch (error) {
      console.error('ElevenLabs Service: Error validating API key:', error);
      return false;
    }
  }

  /**
   * Get user subscription info (for quota checking)
   */
  async getUserInfo(apiKey: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/user`, {
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`ElevenLabs API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('ElevenLabs Service: Error getting user info:', error);
      throw error;
    }
  }
}

const elevenLabsService = new ElevenLabsService();
export default elevenLabsService;
export { ElevenLabsConfig, ElevenLabsVoice };
